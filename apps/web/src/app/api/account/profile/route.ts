import { NextRequest, NextResponse } from "next/server";
import {
  canManageProfileChangeRequests,
  updateSelfProfileDetails,
} from "@/features/account/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { extractJwtClaims } from "@/features/permissions/shared";
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
  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }
    const parsed = accountProfileUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return buildStaffValidationErrorResponse(
        getStaffFieldErrorsFromZod(parsed.error),
      );
    }

    const serviceClient = getServiceClient();
    const { effectiveRole, orgId: claimOrgId } = extractJwtClaims(
      auth.session.access_token,
    );
    const targetOrgId = parsed.data.orgId ?? claimOrgId ?? null;
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
        error:
          "Profile details are changed by admins. Submit a profile change request instead.",
      },
      { status: 403 },
    );
  } catch (error) {
    console.error("account profile PATCH failed", error);
    return NextResponse.json(
      { error: "Failed to update account details" },
      { status: 500 },
    );
  }
}
