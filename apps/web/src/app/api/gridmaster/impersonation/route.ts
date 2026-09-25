import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { createRequestSupabaseClient, requireGridmasterSession } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { scheduleImpersonationNotice } from "@/app/api/gridmaster/_lib/impersonation-notice";
import logger from "@/lib/logger";

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const startSchema = z.object({
  action: z.literal("start"),
  targetUserId: z.string().uuid(),
  justification: z.string().trim().min(10),
  targetOrgId: z.string().uuid().optional(),
  userAgent: z.string().optional(),
});

const endSchema = z.object({
  action: z.literal("end"),
  sessionId: z.string().uuid(),
  // Mirrors impersonation_sessions.end_reason's check constraint, so an
  // unknown value is a 400 here rather than a constraint violation in the RPC.
  reason: z.enum(["manual", "expired", "navigation"]).optional(),
  // Older clients still send it; the organization comes from the session row.
  targetOrgId: z.string().uuid().nullable().optional(),
});

/**
 * This Gridmaster's own impersonation row, the authority for which
 * organization it was in. The request's organization is never trusted.
 */
async function readOwnImpersonation(
  service: ReturnType<typeof getServiceClient>,
  sessionId: string,
  gridmasterId: string,
): Promise<{ target_user_id: string; target_org_id: string; ended_at: string | null } | null> {
  const { data, error } = await service
    .from("impersonation_sessions")
    .select("target_user_id, target_org_id, ended_at")
    .eq("session_id", sessionId)
    .eq("gridmaster_id", gridmasterId)
    .maybeSingle();
  if (error) throw error;
  return (
    (data as { target_user_id: string; target_org_id: string; ended_at: string | null } | null) ??
    null
  );
}

// start_impersonation raises these for caller mistakes, not outages. Answer
// them with their own message so the portal can say what to do next.
const START_CONFLICTS: ReadonlyArray<{ match: string; status: 400 | 409 }> = [
  { match: "while another session is active", status: 409 },
  { match: "Cannot impersonate yourself", status: 400 },
  { match: "does not belong to the specified organization", status: 400 },
  { match: "not found or has no organization", status: 400 },
  { match: "Justification must be", status: 400 },
];

function startConflictResponse(error: { message?: string }): NextResponse | null {
  const message = error.message ?? "";
  const conflict = START_CONFLICTS.find((entry) => message.includes(entry.match));
  if (!conflict) return null;
  return NextResponse.json({ error: message }, { status: conflict.status });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const parsed = historyQuerySchema.safeParse({
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    const { data, error } = await createRequestSupabaseClient(req).rpc(
      "get_impersonation_history",
      {
        p_limit: parsed.data.limit ?? 50,
        p_offset: parsed.data.offset ?? 0,
      },
    );
    if (error) {
      throw error;
    }

    return NextResponse.json({
      entries: (data ?? []).map((row: Record<string, unknown>) => ({
        sessionId: row.session_id as string,
        gridmasterId: row.gridmaster_id as string,
        gridmasterEmail: row.gridmaster_email as string,
        targetUserId: row.target_user_id as string,
        targetEmail: row.target_email as string,
        targetOrgId: row.target_org_id as string,
        targetOrgName: (row.target_org_name as string | null) ?? null,
        justification: (row.justification as string | null) ?? "",
        ipAddress: (row.ip_address as string | null) ?? null,
        userAgent: (row.user_agent as string | null) ?? null,
        createdAt: row.created_at as string,
        endedAt: (row.ended_at as string | null) ?? null,
        endReason: (row.end_reason as string | null) ?? null,
        expiresAt: row.expires_at as string,
      })),
    });
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/impersonation" },
      "gridmaster impersonation GET failed",
    );
    return NextResponse.json(
      { error: "We couldn't load the viewing history. Refresh and try again." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) {
    return csrfError;
  }

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const action =
      body && typeof body === "object" && "action" in body
        ? (body as { action?: unknown }).action
        : undefined;

    const requestClient = createRequestSupabaseClient(req);
    const service = getServiceClient();

    if (action === "start") {
      const parsed = startSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
      }

      const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const { data, error } = await requestClient.rpc("start_impersonation", {
        p_target_user_id: parsed.data.targetUserId,
        p_justification: parsed.data.justification,
        p_ip_address: ipAddress,
        p_user_agent: parsed.data.userAgent ?? null,
        p_target_org_id: parsed.data.targetOrgId ?? null,
      });
      if (error) {
        const conflict = startConflictResponse(error);
        if (conflict) return conflict;
        throw error;
      }

      const result = data as { session_id: string; expires_at: string };
      // The RPC falls back to the target's own organization when none is
      // named, so the row, not the request, says where the session is.
      // The session is already running, so a failed read must not fail the
      // start: the client would hold no cookie and every retry would 409.
      const started = await readOwnImpersonation(service, result.session_id, auth.user.id).catch(
        (error: unknown) => {
          logger.error({ err: error }, "Could not read the started impersonation session");
          return null;
        },
      );
      // Before the audit write, which throws on failure: the session is
      // running either way, and the person must hear about it.
      scheduleImpersonationNotice({
        kind: "start",
        targetUserId: parsed.data.targetUserId,
        targetOrgId: started?.target_org_id ?? null,
        expiresAt: result.expires_at,
      });

      await writeGridmasterAuditLog({
        serviceClient: service,
        actor: auth.user,
        action: "impersonation.started",
        resourceType: "impersonation_session",
        resourceId: result.session_id,
        orgId: started?.target_org_id ?? null,
        details: {
          targetUserId: parsed.data.targetUserId,
          justification: parsed.data.justification,
        },
        request: req,
      });

      return NextResponse.json({
        sessionId: result.session_id,
        expiresAt: result.expires_at,
      });
    }

    if (action === "end") {
      const parsed = endSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
      }

      // end_impersonation does nothing, silently, for a session that is not
      // this Gridmaster's or has already ended; record only a real end.
      const session = await readOwnImpersonation(service, parsed.data.sessionId, auth.user.id);
      if (!session || session.ended_at) {
        return NextResponse.json(
          { error: "That viewing session has already ended." },
          { status: 404 },
        );
      }

      const { error } = await requestClient.rpc("end_impersonation", {
        p_session_id: parsed.data.sessionId,
        p_reason: parsed.data.reason ?? "manual",
      });
      if (error) {
        throw error;
      }

      // Before the audit write: a retry after a failed write finds the
      // session ended and would never send this.
      scheduleImpersonationNotice({
        kind: "end",
        targetUserId: session.target_user_id,
        targetOrgId: session.target_org_id,
      });

      await writeGridmasterAuditLog({
        serviceClient: service,
        actor: auth.user,
        action: "impersonation.ended",
        resourceType: "impersonation_session",
        resourceId: parsed.data.sessionId,
        orgId: session.target_org_id,
        details: {
          reason: parsed.data.reason ?? "manual",
        },
        request: req,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/impersonation" },
      "gridmaster impersonation POST failed",
    );
    return NextResponse.json(
      { error: "We couldn't update that viewing session. Try again." },
      { status: 500 },
    );
  }
}
