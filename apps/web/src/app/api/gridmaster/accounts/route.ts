import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  createRequestSupabaseClient,
  requireGridmasterSession,
  requireSensitiveActionAuth,
  stepUpResponseForRefusal,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { apiErrorResponse } from "@/lib/error-handling";
import logger from "@/lib/logger";
import type { GridmasterAccount } from "@/types";

const accountActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("promote"),
    email: z.string().email(),
  }),
  z.object({
    action: z.literal("demote"),
    userId: z.string().uuid(),
    orgId: z.string().uuid(),
    orgRole: z.enum(["super_admin", "admin", "user"]),
  }),
  z.object({
    action: z.literal("setActivation"),
    userId: z.string().uuid(),
    deactivate: z.boolean(),
  }),
]);

function getRpcPayload(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

async function loadGridmasterAccounts(): Promise<GridmasterAccount[]> {
  const serviceClient = getServiceClient();
  const { data: profiles, error } = await serviceClient
    .from("profiles")
    .select("id, first_name, last_name, created_at, deactivated_at, deactivated_by")
    .eq("platform_role", "gridmaster");

  if (error) {
    throw error;
  }

  const accounts = await Promise.all(
    ((profiles ?? []) as Record<string, unknown>[]).map(async (profile) => {
      const id = profile.id as string;
      const authResult = await serviceClient.auth.admin.getUserById(id);
      if (authResult.error) {
        throw authResult.error;
      }
      const user = authResult.data.user;
      return {
        id,
        email: user?.email ?? null,
        firstName: (profile.first_name as string | null) ?? null,
        lastName: (profile.last_name as string | null) ?? null,
        createdAt:
          (profile.created_at as string | null) ?? user?.created_at ?? new Date(0).toISOString(),
        lastSignInAt: user?.last_sign_in_at ?? null,
        deactivatedAt: (profile.deactivated_at as string | null) ?? null,
        deactivatedBy: (profile.deactivated_by as string | null) ?? null,
      };
    }),
  );

  return accounts.sort((left, right) => {
    const leftInactive = left.deactivatedAt ? 1 : 0;
    const rightInactive = right.deactivatedAt ? 1 : 0;
    if (leftInactive !== rightInactive) return leftInactive - rightInactive;
    return (left.email ?? "").localeCompare(right.email ?? "");
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    return NextResponse.json({
      accounts: await loadGridmasterAccounts(),
    });
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/accounts" },
      "gridmaster accounts GET failed",
    );
    return NextResponse.json(
      { error: "We couldn't load the gridmaster accounts. Refresh and try again." },
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

    // Promoting, demoting or deactivating a Gridmaster changes platform
    // authority, so it needs fresh proof like force-logout (41b3).
    const assurance = await requireSensitiveActionAuth(req);
    if ("response" in assurance) {
      return assurance.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = accountActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const requestClient = createRequestSupabaseClient(req);
    const serviceClient = getServiceClient();

    if (parsed.data.action === "promote") {
      const result = await requestClient.rpc("promote_gridmaster_by_email", {
        p_email: parsed.data.email,
      });
      if (result.error) {
        const stepUp = await stepUpResponseForRefusal(req, result.error);
        if (stepUp) return stepUp;
        return apiErrorResponse(
          result.error,
          "We couldn't promote gridmaster account. Try again.",
          400,
        );
      }
      const payload = getRpcPayload(result.data);
      const userId = (payload.user_id as string | undefined) ?? null;
      await writeGridmasterAuditLog({
        serviceClient,
        actor: auth.user,
        action: "gridmaster_account.promoted",
        resourceType: "user",
        resourceId: userId,
        details: { targetEmail: parsed.data.email, targetUserId: userId },
        request: req,
      });
      return NextResponse.json({ success: true, userId });
    }

    if (parsed.data.action === "demote") {
      const result = await requestClient.rpc("demote_gridmaster_account", {
        p_target_user_id: parsed.data.userId,
        p_org_id: parsed.data.orgId,
        p_org_role: parsed.data.orgRole,
      });
      if (result.error) {
        const stepUp = await stepUpResponseForRefusal(req, result.error);
        if (stepUp) return stepUp;
        return apiErrorResponse(
          result.error,
          "We couldn't demote gridmaster account. Try again.",
          400,
        );
      }
      await writeGridmasterAuditLog({
        serviceClient,
        actor: auth.user,
        action: "gridmaster_account.demoted",
        resourceType: "user",
        resourceId: parsed.data.userId,
        orgId: parsed.data.orgId,
        details: {
          targetUserId: parsed.data.userId,
          targetOrgId: parsed.data.orgId,
          orgRole: parsed.data.orgRole,
        },
        request: req,
      });
      return NextResponse.json({ success: true });
    }

    const result = await requestClient.rpc("set_gridmaster_account_deactivated", {
      p_target_user_id: parsed.data.userId,
      p_deactivate: parsed.data.deactivate,
    });
    if (result.error) {
      const stepUp = await stepUpResponseForRefusal(req, result.error);
      if (stepUp) return stepUp;
      return apiErrorResponse(
        result.error,
        "We couldn't update gridmaster account. Try again.",
        400,
      );
    }
    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: parsed.data.deactivate
        ? "gridmaster_account.deactivated"
        : "gridmaster_account.reactivated",
      resourceType: "user",
      resourceId: parsed.data.userId,
      details: {
        targetUserId: parsed.data.userId,
        deactivate: parsed.data.deactivate,
      },
      request: req,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      { err: error, path: "/api/gridmaster/accounts" },
      "gridmaster accounts POST failed",
    );
    return NextResponse.json(
      { error: "We couldn't update that gridmaster account. Try again." },
      { status: 500 },
    );
  }
}
