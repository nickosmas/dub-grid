import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireMobileAuth } from "@/features/mobile/server";
import {
  checkEmployeeEmailConflict,
  checkEmployeePhoneConflict,
  EmployeeContactLookupError,
} from "@/features/employees/server/contact-conflicts";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// The web check's rule. An address it refuses can't be saved, so it has no
// conflict to report, and it never reaches the lookup as a pattern.
const checkableEmail = z.string().trim().email();

const bodySchema = z.object({
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  excludeEmployeeId: z.string().uuid().optional(),
});

/**
 * Pre-flight duplicate check for the mobile add and edit person forms, so a
 * taken email or phone paints an inline field error while it is still being
 * typed rather than failing the save.
 *
 * The org is the caller's effective (sandbox-aware) one, never a body field.
 * Both forms send whichever fields they are checking, so a single round trip
 * covers an edit panel that changed both.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  if (!auth.permissions.canManageEmployees) {
    return NextResponse.json(
      { error: "You don't have permission to manage staff members." },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the request and try again." }, { status: 400 });
  }

  const emailInput = checkableEmail.safeParse(parsed.data.email);
  const email = emailInput.success ? emailInput.data : "";
  const phone = parsed.data.phone?.trim() ?? "";

  try {
    const [emailResult, phoneResult] = await Promise.all([
      email
        ? checkEmployeeEmailConflict(auth.serviceClient, {
            orgId: auth.currentOrg.id,
            email,
            excludeEmployeeId: parsed.data.excludeEmployeeId,
          })
        : Promise.resolve(null),
      phone
        ? checkEmployeePhoneConflict(auth.serviceClient, {
            orgId: auth.currentOrg.id,
            phone,
            excludeEmployeeId: parsed.data.excludeEmployeeId,
          })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({ email: emailResult, phone: phoneResult });
  } catch (error) {
    if (error instanceof EmployeeContactLookupError) {
      logger.error({ error: error.cause }, error.message);
      return NextResponse.json(
        { error: "We couldn't check those details. Try again." },
        { status: 500 },
      );
    }
    throw error;
  }
}
