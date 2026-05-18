import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/api-auth";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiErrorResponse } from "@/lib/error-handling";

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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = roleChangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Redirect to sandbox if the caller is in sandbox mode, so role
    // changes inside a sandbox don't leak to the real workspace's
    // memberships.
    const effectiveOrgId = parsed.data.orgId
      ? await resolveEffectiveOrgId(req, auth.user.id, parsed.data.orgId)
      : null;

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("change_user_role", {
      p_target_user_id: parsed.data.targetUserId,
      p_new_role: parsed.data.newRole,
      p_changed_by_id: auth.user.id,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_org_id: effectiveOrgId,
    });

    if (result.error) {
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
