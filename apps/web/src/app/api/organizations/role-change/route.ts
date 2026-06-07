import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/api-auth";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { getServiceClient } from "@/lib/supabase-service";
import { isOrgSuperAdminOrGridmaster } from "@/app/api/employees/shared";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/error-handling";
import {
  SELF_ACTION_FORBIDDEN_CODE,
  SELF_ACTION_FORBIDDEN_MESSAGE,
} from "@dubgrid/domain";
import { API_ERRORS } from "@dubgrid/client-errors";

const roleChangeSchema = z.object({
  targetUserId: z.string().uuid(),
  newRole: z.string().min(1),
  orgId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    const { limited, reset, misconfigured } = await checkRateLimit(
      apiLimiter,
      auth.user.id,
    );
    if (misconfigured) {
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 },
      );
    }
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = roleChangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    // Self-action guard: you cannot change your own role. The RPC also blocks
    // this; we short-circuit here for a clean, mappable error code.
    if (parsed.data.targetUserId === auth.user.id) {
      return NextResponse.json(
        { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
        { status: 403 },
      );
    }

    // Redirect to sandbox if the caller is in sandbox mode, so role
    // changes inside a sandbox don't leak to the real organization's
    // memberships.
    const effectiveOrgId = parsed.data.orgId
      ? await resolveEffectiveOrgId(req, auth.user.id, parsed.data.orgId)
      : null;

    // Defensive tier guard: only super_admin or gridmaster can promote
    // another user to super_admin. The change_user_role RPC also enforces
    // this, but checking at the API layer gives a clean 403 and avoids
    // round-tripping a forbidden mutation to the DB. (audit L3)
    if (parsed.data.newRole === "super_admin" && effectiveOrgId) {
      const allowed = await isOrgSuperAdminOrGridmaster(
        getServiceClient(),
        auth.user.id,
        effectiveOrgId,
      );
      if (!allowed) {
        return NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 });
      }
    }

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("change_user_role", {
      p_target_user_id: parsed.data.targetUserId,
      p_new_role: parsed.data.newRole,
      p_changed_by_id: auth.user.id,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_org_id: effectiveOrgId,
    });

    if (result.error) {
      // Map the RPC's self-action guard to a clean, mappable error code.
      if (result.error.message?.includes(SELF_ACTION_FORBIDDEN_CODE)) {
        return NextResponse.json(
          { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
          { status: 403 },
        );
      }
      return apiErrorResponse(result.error, "Failed to change role", 400);
    }

    return NextResponse.json({
      result: (result.data ?? { status: "success" }) as Record<string, unknown>,
    });
  } catch (error) {
    console.error("organization role change POST failed", error);
    return NextResponse.json(
      { error: "Failed to change role" },
      { status: 500 },
    );
  }
}
