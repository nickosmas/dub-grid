import { NextRequest, NextResponse } from "next/server";
import { updateSelfLinkedEmployeePhone } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import {
  buildStaffValidationErrorResponse,
  getStaffFieldErrorsFromZod,
} from "@/lib/staff-validation";
import { optionalUsPhoneSchema } from "@dubgrid/contracts";
import { z } from "zod";

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
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const parsed = phoneUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return buildStaffValidationErrorResponse(
        getStaffFieldErrorsFromZod(parsed.error),
      );
    }

    return NextResponse.json(
      await updateSelfLinkedEmployeePhone({
        userId: auth.user.id,
        userEmail: auth.user.email ?? null,
        orgId: parsed.data.orgId,
        phone: parsed.data.phone,
        expectedVersion: parsed.data.expectedVersion,
      }),
    );
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }

    const message =
      error instanceof Error ? error.message : "Failed to update phone.";
    const status = message.includes("changed elsewhere") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
