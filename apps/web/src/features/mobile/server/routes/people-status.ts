import { NextResponse, type NextRequest } from "next/server";
import {
  mobilePersonStatusUpdateBodySchema,
  mobilePersonStatusUpdateResponseSchema,
} from "@dubgrid/contracts";
import { MobileApiAuthorizationError, updateMobilePersonStatus } from "@dubgrid/mobile-api-core";
import {
  archiveMobileOrganizationMembership,
  countMobileActiveSuperAdmins,
  disableMobilePushTokensForOrg,
  fetchMobileActiveMembershipOrgRole,
  fetchMobileEmployeeRowById,
  insertMobileAuditLogEntry,
  restoreMobileOrganizationMembership,
  updateMobileEmployeeReturnDateRow,
  updateMobileEmployeeStatusRow,
  updateMobileEmployeeSuspensionRow,
} from "@dubgrid/data-access";
import logger from "@/lib/logger";
import { endUserSessions } from "@/lib/auth/revocation";
import { requireMobileAuth } from "@/features/mobile/server";
import { mapEmployeeToMobilePerson } from "./people";
import { rowToEmployee } from "@/lib/db/mappers";

export const dynamic = "force-dynamic";

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers?.get("x-forwarded-for") ?? null;
  if (!forwarded) {
    return null;
  }

  return forwarded.split(",")[0]?.trim() || null;
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that status update. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobilePersonStatusUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the status details and try again." }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    const result = await updateMobilePersonStatus(
      auth,
      {
        employeeId: id,
        body: parsed.data,
        requestIp: getRequestIp(req),
        userAgent: req.headers?.get("user-agent") ?? null,
      },
      {
        fetchEmployeeById: async (serviceClient, orgId, employeeId) => {
          const row = await fetchMobileEmployeeRowById(serviceClient, orgId, employeeId);
          return row ? rowToEmployee(row) : null;
        },
        updateEmployeeStatus: async (serviceClient, input) => {
          const row = await updateMobileEmployeeStatusRow(serviceClient, input);
          return row ? rowToEmployee(row) : null;
        },
        updateEmployeeReturnDate: async (serviceClient, input) => {
          const row = await updateMobileEmployeeReturnDateRow(serviceClient, input);
          return row ? rowToEmployee(row) : null;
        },
        updateEmployeeSuspension: async (serviceClient, input) => {
          const row = await updateMobileEmployeeSuspensionRow(serviceClient, input);
          return row ? rowToEmployee(row) : null;
        },
        // Never fail the suspension over tidying up: the hook already
        // refuses their next sign-in and refresh (101).
        endAccess: async (serviceClient, { userId, orgId }) => {
          try {
            await endUserSessions(userId);
            await disableMobilePushTokensForOrg(serviceClient, { userId, orgId });
          } catch (error) {
            logger.error(
              { error, orgId, userId },
              "Failed to end sessions or push after suspending",
            );
          }
        },
        insertAuditLog: insertMobileAuditLogEntry,
        mapEmployeeToMobilePerson,
        fetchActiveMembershipOrgRole: fetchMobileActiveMembershipOrgRole,
        countActiveSuperAdmins: countMobileActiveSuperAdmins,
        archiveOrganizationMembership: archiveMobileOrganizationMembership,
        restoreOrganizationMembership: restoreMobileOrganizationMembership,
      },
    );

    if (result.kind === "updated") {
      return NextResponse.json(
        mobilePersonStatusUpdateResponseSchema.parse({
          success: true,
          person: result.person,
        }),
      );
    }

    if (result.kind === "conflict") {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          person: result.person,
        },
        { status: result.status },
      );
    }

    if (
      result.kind === "self_action_forbidden" ||
      result.kind === "invalid_return_date" ||
      result.kind === "invalid_status_change"
    ) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    if (error instanceof MobileApiAuthorizationError) {
      return NextResponse.json(
        { error: "You don't have permission to update staff status." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "We couldn't update that person right now." },
      { status: 500 },
    );
  }
}
