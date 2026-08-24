import { NextRequest, NextResponse } from "next/server";
import { updateSelfLinkedEmployeePhone } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
} from "@/lib/staff-validation";
import { optionalUsPhoneSchema } from "@dubgrid/contracts";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/error-handling";
import { extractRawErrorMessage } from "@/lib/client-facing";
import { API_ERRORS } from "@dubgrid/client-errors";

const phoneUpdateSchema = z.object({
  orgId: z.string().uuid(),
  phone: optionalUsPhoneSchema,
  expectedVersion: z.number().int().nonnegative().optional(),
});

export async function PATCH(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) return auth.response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = phoneUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return buildStaffValidationErrorResponse(getStaffFieldErrorsFromZod(parsed.error));
    }

    const orgId = await resolveEffectiveOrgId(req, auth.user.id, parsed.data.orgId);

    return NextResponse.json(
      await updateSelfLinkedEmployeePhone({
        userId: auth.user.id,
        userEmail: auth.user.email ?? null,
        orgId,
        phone: parsed.data.phone,
        expectedVersion: parsed.data.expectedVersion,
      }),
    );
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }

    const rawMessage = extractRawErrorMessage(error) ?? "";
    const status = rawMessage.includes("changed elsewhere") ? 409 : 400;
    return apiErrorResponse(error, "We couldn't update phone. Try again.", status);
  }
}
