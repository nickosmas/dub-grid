import { NextRequest, NextResponse } from "next/server";
import {
  canManageProfileChangeRequests,
  updateSelfProfileDetails,
} from "@/features/account/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { getServiceClient } from "@/lib/supabase-service";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
} from "@/lib/staff-validation";
import { staffNameSchema } from "@dubgrid/contracts";
import { z } from "zod";

const accountProfileUpdateSchema = z.object({
  firstName: staffNameSchema,
  lastName: staffNameSchema,
  orgId: z.string().uuid().nullable(),
});

export async function PATCH(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }
    const parsed = accountProfileUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return buildStaffValidationErrorResponse(getStaffFieldErrorsFromZod(parsed.error));
    }

    const serviceClient = getServiceClient();
    // auth.claims is already sandbox-rewritten by requireAuthenticatedUserWithClaims
    // (org_id -> sandbox org, org_role -> "super_admin") — derive from it directly
    // rather than re-decoding the raw access token, which would ignore sandbox mode.
    const claimOrgId = typeof auth.claims.org_id === "string" ? auth.claims.org_id : null;
    const claimOrgRole = (auth.claims.org_role as string) || "user";
    const effectiveRole = auth.claims.platform_role === "gridmaster" ? "gridmaster" : claimOrgRole;
    const requestedOrgId = parsed.data.orgId ?? claimOrgId;
    const targetOrgId = requestedOrgId
      ? await resolveEffectiveOrgId(req, auth.user.id, requestedOrgId)
      : null;
    const canEditDirectly =
      effectiveRole === "gridmaster" ||
      (targetOrgId
        ? await canManageProfileChangeRequests({
            serviceClient,
            actorId: auth.user.id,
            orgId: targetOrgId,
          })
        : false);

    if (canEditDirectly) {
      const result = await updateSelfProfileDetails({
        userId: auth.user.id,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        orgId: targetOrgId,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      {
        error: "Profile details are changed by admins. Submit a profile change request instead.",
      },
      { status: 403 },
    );
  } catch (error) {
    console.error("account profile PATCH failed", error);
    return NextResponse.json({ error: "Failed to update account details" }, { status: 500 });
  }
}
