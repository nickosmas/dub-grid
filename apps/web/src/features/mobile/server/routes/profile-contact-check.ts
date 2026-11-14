import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireMobileAuth } from "@/features/mobile/server";
import {
  checkOwnContact,
  EmployeeContactLookupError,
} from "@/features/employees/server/contact-conflicts";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// An address the form would refuse has nothing to check, and never reaches the
// lookup as a pattern.
const checkableEmail = z.string().trim().email().max(320);

const bodySchema = z.object({
  email: z.string().trim().optional(),
  phone: z.string().trim().max(40).optional(),
});

/**
 * Pre-flight check for the app's own profile, the counterpart of web's
 * `/api/account/profile/contact-check`: yes or no for the caller's own email
 * and phone, nothing about who holds them. An address used only outside the
 * caller's organizations reads as free (owner, 2026-11-13).
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some of those details look off. Review them and try again." },
      { status: 400 },
    );
  }

  const emailInput = checkableEmail.safeParse(parsed.data.email);
  const email = emailInput.success ? emailInput.data : null;
  const phone = parsed.data.phone || null;

  try {
    const result = await checkOwnContact(auth.serviceClient, {
      userId: auth.user.id,
      orgId: auth.currentOrg.id,
      email,
      phone,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EmployeeContactLookupError) {
      logger.error({ error: error.cause }, error.message);
      return NextResponse.json(
        { error: "We couldn't check whether that's free. Try again." },
        { status: 500 },
      );
    }
    throw error;
  }
}
