import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchHiddenPeople, requireOrgPermissions } from "@/app/api/shared/permissions";
import { withoutHiddenStaff } from "@dubgrid/data-access";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";

const searchSchema = z.object({
  orgId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = searchSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const orgAuth = await requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) =>
        permissions.isGridmaster ||
        permissions.isSuperAdmin ||
        permissions.canViewStaff ||
        permissions.canManageEmployees,
      { allowDuringSetup: true },
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }

    const { count, error } = await withoutHiddenStaff(
      orgAuth.serviceClient
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgAuth.orgId)
        .is("archived_at", null),
      await fetchHiddenPeople(orgAuth),
    );

    if (error) throw error;

    return NextResponse.json({ employeeCount: count ?? 0 });
  } catch (error) {
    logger.error({ error }, "organization employee count GET failed");
    return NextResponse.json(
      { error: "We couldn't load the team size. Refresh and try again." },
      { status: 500 },
    );
  }
}
