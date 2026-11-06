import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import {
  checkOwnContact,
  EmployeeContactLookupError,
} from "@/features/employees/server/contact-conflicts";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { getServiceClient } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgId: z.string().uuid().nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().min(1).max(40).nullable().optional(),
});

/**
 * Pre-flight check for My profile's email and phone. The manager checks
 * (`/api/employees/check-email`, `check-phone`) need Manage staff, and this
 * answers only for the caller's own record, with yes or no and nothing about
 * who holds the value.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: API_ERRORS.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(reset)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }
  const { email, phone } = parsed.data;

  try {
    const orgId = parsed.data.orgId
      ? await resolveEffectiveOrgId(req, user.id, parsed.data.orgId)
      : null;
    const result = await checkOwnContact(getServiceClient(), {
      userId: user.id,
      orgId,
      email: email ?? null,
      phone: phone ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EmployeeContactLookupError) {
      logger.error({ error: error.cause }, error.message);
      return NextResponse.json({ error: "We couldn't check that. Try again." }, { status: 500 });
    }
    throw error;
  }
}
