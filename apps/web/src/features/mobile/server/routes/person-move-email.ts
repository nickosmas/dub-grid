import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonMoveEmailBodySchema,
  mobilePersonMoveEmailResponseSchema,
} from "@dubgrid/contracts";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireMobileSensitiveActionAuth } from "@/features/mobile/server";
import { loadMobilePersonWithAccess } from "@/features/mobile/server/person-access";
import { getRequestIp } from "@/features/mobile/server/management-roster";
import { moveStaffRecordToNewEmail } from "@/features/employees/server/move-email";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * The app's Move to a new email. Fresh proof first, as on web, then the same
 * shared move; the organization is the token's, never one the client names.
 * Gridmasters can't reach the app, so the elevated-role check is the caller's
 * own Super Admin membership.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileSensitiveActionAuth(req);
  if ("response" in auth) return auth.response;

  if (!auth.permissions.canManageEmployees) {
    return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
  }

  const parsed = mobilePersonMoveEmailBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the new email and try again." }, { status: 400 });
  }

  const { id } = await context.params;
  const orgId = auth.currentOrg.id;
  const result = await moveStaffRecordToNewEmail({
    serviceClient: auth.serviceClient,
    orgId,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    canGrantElevatedRoles: async () =>
      auth.permissions.isSuperAdmin || auth.permissions.isGridmaster,
    empId: id,
    email: parsed.data.email,
    expectedVersion: parsed.data.expectedVersion,
    requestContext: { ipAddress: getRequestIp(req), userAgent: req.headers.get("user-agent") },
  });
  if ("response" in result) return result.response;

  try {
    const loaded = await loadMobilePersonWithAccess(auth.serviceClient, orgId, id);
    if (!loaded) throw new Error("moved person not found");
    return NextResponse.json(
      mobilePersonMoveEmailResponseSchema.parse({
        success: true,
        person: loaded.person,
        invited: result.invited,
      }),
    );
  } catch (error) {
    // The move has committed; the app refetches the person when this fails.
    logger.error({ error, empId: id }, "reloading a moved person failed");
    return NextResponse.json(
      { error: "They were moved, but we couldn't show it here. Open their page again." },
      { status: 500 },
    );
  }
}
