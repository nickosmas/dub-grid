import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import {
  checkEmployeePhoneConflict,
  EmployeeContactLookupError,
} from "@/features/employees/server/contact-conflicts";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";
import { validateCsrfOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().trim().min(1),
  orgId: z.string().uuid(),
  excludeEmployeeId: z.string().uuid().optional(),
});

/**
 * Pre-flight check for the invite phone field. The digits-only comparison that
 * mirrors `unique_active_employee_phone_per_org` lives in
 * `@/features/employees/server/contact-conflicts`, shared with the mobile
 * contact-check route.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }
  const { phone, orgId, excludeEmployeeId } = parsed.data;

  const serviceClient = getServiceClient();
  const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
  if (!hasPermission) {
    return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
  }

  try {
    const result = await checkEmployeePhoneConflict(serviceClient, {
      orgId,
      phone,
      excludeEmployeeId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EmployeeContactLookupError) {
      logger.error({ error: error.cause }, error.message);
      return NextResponse.json(
        { error: "We couldn't check that phone number. Try again." },
        { status: 500 },
      );
    }
    throw error;
  }
}
