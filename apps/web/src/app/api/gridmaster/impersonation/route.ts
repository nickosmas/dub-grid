import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireGridmasterSession,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";

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
  reason: z.string().trim().min(1).optional(),
  targetOrgId: z.string().uuid().nullable().optional(),
});

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
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
    console.error("gridmaster impersonation GET failed", error);
    return NextResponse.json(
      { error: "Failed to load impersonation history" },
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
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }

      const ipAddress =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const { data, error } = await requestClient.rpc("start_impersonation", {
        p_target_user_id: parsed.data.targetUserId,
        p_justification: parsed.data.justification,
        p_ip_address: ipAddress,
        p_user_agent: parsed.data.userAgent ?? null,
        p_target_org_id: parsed.data.targetOrgId ?? null,
      });
      if (error) {
        throw error;
      }

      const result = data as { session_id: string; expires_at: string };
      await writeGridmasterAuditLog({
        serviceClient: service,
        actor: auth.user,
        action: "impersonation.started",
        resourceType: "impersonation_session",
        resourceId: result.session_id,
        orgId: parsed.data.targetOrgId ?? null,
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
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }

      const { error } = await requestClient.rpc("end_impersonation", {
        p_session_id: parsed.data.sessionId,
        p_reason: parsed.data.reason ?? "manual",
      });
      if (error) {
        throw error;
      }

      await writeGridmasterAuditLog({
        serviceClient: service,
        actor: auth.user,
        action: "impersonation.ended",
        resourceType: "impersonation_session",
        resourceId: parsed.data.sessionId,
        orgId: parsed.data.targetOrgId ?? null,
        details: {
          reason: parsed.data.reason ?? "manual",
        },
        request: req,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("gridmaster impersonation POST failed", error);
    return NextResponse.json(
      { error: "Failed to update impersonation session" },
      { status: 500 },
    );
  }
}
