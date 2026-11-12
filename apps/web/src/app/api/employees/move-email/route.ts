import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { forbidIfSandboxCookie, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase-service";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { canManageEmployees, isOrgSuperAdminOrGridmaster } from "@/app/api/employees/shared";
import { moveStaffRecordToNewEmail } from "@/features/employees/server/move-email";
import { getRequestIp } from "@/features/mobile/server/management-roster";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orgId: z.string().uuid(),
  empId: z.string().uuid(),
  email: z.string().trim().email(),
  expectedVersion: z.number().int().min(0),
});

function refuse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * POST /api/employees/move-email
 * Points a joined person's staff record at a new address, for someone who lost
 * their mailbox. The rules live in `moveStaffRecordToNewEmail`, which the app's
 * route shares.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  const auth = await requireSensitiveActionAuth(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return refuse(API_ERRORS.INVALID_BODY, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return refuse(API_ERRORS.INVALID_INPUT, 400);

  let orgId: string;
  const serviceClient = getServiceClient();
  try {
    orgId = await resolveEffectiveOrgId(req, user.id, parsed.data.orgId);
    if (!(await canManageEmployees(req, serviceClient, user.id, orgId))) {
      return refuse(API_ERRORS.CANNOT_MANAGE_EMPLOYEES, 403);
    }
  } catch (error) {
    logger.error(
      { error, empId: parsed.data.empId },
      "moving a staff record to a new email failed",
    );
    return refuse("We couldn't move them to that email. Try again.", 500);
  }

  const result = await moveStaffRecordToNewEmail({
    serviceClient,
    orgId,
    actor: { id: user.id, email: user.email ?? null },
    canGrantElevatedRoles: () => isOrgSuperAdminOrGridmaster(serviceClient, user.id, orgId),
    empId: parsed.data.empId,
    email: parsed.data.email,
    expectedVersion: parsed.data.expectedVersion,
    requestContext: { ipAddress: getRequestIp(req), userAgent: req.headers.get("user-agent") },
  });
  if ("response" in result) return result.response;
  return NextResponse.json(result);
}
