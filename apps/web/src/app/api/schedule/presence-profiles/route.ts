import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { getOrgRoleLabel } from "@dubgrid/domain";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import logger from "@/lib/logger";

/**
 * Display detail for the editors currently present on the schedule.
 *
 * Deliberately fetched on demand instead of ridden along in the Realtime
 * presence payload: presence fans out to every subscriber continuously, and
 * email has no business being broadcast to everyone with the schedule open.
 * Here it stays behind an authenticated, organization-scoped read.
 */
const MAX_PRESENCE_PROFILES = 50;
const requestSchema = z.object({
  orgId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).min(1).max(MAX_PRESENCE_PROFILES),
});

const canUseScheduleEditor = (permissions: {
  isGridmaster: boolean;
  isSuperAdmin: boolean;
  canEditShifts: boolean;
  canEditNotes: boolean;
}) =>
  permissions.isGridmaster ||
  permissions.isSuperAdmin ||
  permissions.canEditShifts ||
  permissions.canEditNotes;

export async function GET(req: NextRequest) {
  const rawUserIds = req.nextUrl.searchParams.get("userIds");
  const parsed = requestSchema.safeParse({
    orgId: req.nextUrl.searchParams.get("orgId"),
    userIds: rawUserIds ? rawUserIds.split(",").filter(Boolean) : [],
  });
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  try {
    const auth = await requireOrgPermissions(req, parsed.data.orgId, canUseScheduleEditor, {
      allowDuringSetup: true,
      allowLockedOrganization: true,
    });
    if ("response" in auth) return auth.response;

    const requestedUserIds = Array.from(new Set(parsed.data.userIds));

    // Every read is filtered by the effective organization from `auth`, never
    // by the id the client sent, so a caller cannot ask about someone in
    // another tenant. Anyone outside the organization simply yields no row.
    const { data: memberships, error: membershipError } = await auth.serviceClient
      .from("organization_memberships")
      .select("user_id, org_role")
      .eq("org_id", auth.orgId)
      .is("archived_at", null)
      .in("user_id", requestedUserIds);

    if (membershipError) throw membershipError;

    const members = memberships ?? [];
    if (members.length === 0) return NextResponse.json({ profiles: [] });

    const memberUserIds = members.map((member) => member.user_id);
    const { data: employees, error: employeeError } = await auth.serviceClient
      .from("employees")
      .select("user_id, email")
      .eq("org_id", auth.orgId)
      .in("user_id", memberUserIds);

    if (employeeError) throw employeeError;

    // `employees.email` defaults to an empty string, and a member may have no
    // linked employee record at all, so both mean "nothing to show".
    const emailByUserId = new Map<string, string>();
    for (const employee of employees ?? []) {
      if (!employee.user_id) continue;
      const email = (employee.email ?? "").trim();
      if (email) emailByUserId.set(employee.user_id, email);
    }

    return NextResponse.json({
      profiles: members.map((member) => ({
        userId: member.user_id,
        orgRole: getOrgRoleLabel(member.org_role),
        email: emailByUserId.get(member.user_id) ?? null,
      })),
    });
  } catch (error) {
    logger.error({ error }, "schedule presence profile lookup failed");
    return NextResponse.json(
      { error: "We couldn't load who is online. Try again." },
      { status: 500 },
    );
  }
}
