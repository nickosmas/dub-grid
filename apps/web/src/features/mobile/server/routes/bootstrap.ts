import { NextResponse, type NextRequest } from "next/server";
import { mobileBootstrapResponseSchema } from "@dubgrid/contracts";
import {
  fetchMobileAbsenceTypes,
  fetchMobileFocusAreas,
  fetchLinkedEmployeeForUser,
  fetchMobileUnreadNotificationCount,
  mapOrganizationToMobileConfig,
  requireMobileAuth,
} from "@/features/mobile/server";
import { createMobileOptionsHandler, withMobileCors } from "./cors";

export const dynamic = "force-dynamic";
const CORS_METHODS = ["GET", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

export async function GET(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);
  const auth = await requireMobileAuth(req);
  if ("response" in auth)
    return withMobileCors(req, auth.response, CORS_METHODS);

  const [linkedEmployee, unreadNotificationCount, absenceTypes, focusAreas] =
    await Promise.all([
      fetchLinkedEmployeeForUser(
        auth.serviceClient,
        auth.currentOrg.id,
        auth.user.id,
      ),
      fetchMobileUnreadNotificationCount(auth.userClient),
      fetchMobileAbsenceTypes(auth.serviceClient, auth.currentOrg.id),
      fetchMobileFocusAreas(auth.serviceClient, auth.currentOrg.id),
    ]);

  const payload = mobileBootstrapResponseSchema.parse({
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
      firstName:
        (auth.user.user_metadata?.first_name as string | undefined) ?? null,
      lastName:
        (auth.user.user_metadata?.last_name as string | undefined) ?? null,
    },
    currentOrg: mapOrganizationToMobileConfig(auth.currentOrg),
    memberships: auth.memberships.map((membership) => ({
      id: membership.orgId,
      name: membership.orgName,
      slug: membership.orgSlug,
      orgRole:
        membership.orgRole === "super_admin" || membership.orgRole === "admin"
          ? membership.orgRole
          : "user",
      platformRole: membership.platformRole,
      isCurrent: membership.orgId === auth.currentOrg.id,
    })),
    effectiveRole:
      auth.permissions.role === "super_admin" ||
      auth.permissions.role === "admin"
        ? auth.permissions.role
        : "user",
    permissions: auth.permissions,
    linkedEmployee: linkedEmployee
      ? {
          id: linkedEmployee.id,
          firstName: linkedEmployee.firstName,
          lastName: linkedEmployee.lastName,
          status: linkedEmployee.status,
          focusAreaIds: linkedEmployee.focusAreaIds,
        }
      : null,
    absenceTypes,
    focusAreas,
    unreadNotificationCount,
  });

  return json(payload);
}
