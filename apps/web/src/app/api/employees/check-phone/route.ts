import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { canManageEmployees } from "@/app/api/employees/shared";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().trim().min(1),
  orgId: z.string().uuid(),
  excludeEmployeeId: z.string().uuid().optional(),
});

/**
 * Pre-flight check for the invite phone field: is this number already the
 * contact phone of a DIFFERENT active employee in this org? Mirrors
 * `unique_active_employee_phone_per_org` (supabase/migrations/001_schema.sql),
 * which compares digits only, so the conflict can be flagged before save
 * instead of only surfacing at invitation-accept time.
 */
export async function POST(req: NextRequest) {
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
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return NextResponse.json({ conflict: false, conflictingEmployeeId: null });
  }

  const serviceClient = getServiceClient();
  const hasPermission = await canManageEmployees(serviceClient, user.id, orgId);
  if (!hasPermission) {
    return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
  }

  const { data, error } = await serviceClient
    .from("employees")
    .select("id, phone")
    .eq("org_id", orgId)
    .is("archived_at", null);
  if (error) {
    logger.error({ error }, "employees check-phone lookup failed");
    return NextResponse.json(
      { error: "We couldn't check that phone number. Try again." },
      { status: 500 },
    );
  }

  const conflictRow = (data ?? []).find((row) => {
    if (excludeEmployeeId && row.id === excludeEmployeeId) return false;
    return typeof row.phone === "string" && row.phone.replace(/\D/g, "") === digits;
  });

  return NextResponse.json({
    conflict: !!conflictRow,
    conflictingEmployeeId: (conflictRow?.id as string | undefined) ?? null,
  });
}
