import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { API_ERRORS } from "@dubgrid/client-errors";

const searchSchema = z.object({
  orgId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = searchSchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
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

    const serviceClient = orgAuth.serviceClient;
    const { count, error } = await serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgAuth.orgId)
      .is("archived_at", null);

    if (error) throw error;

    return NextResponse.json({ employeeCount: count ?? 0 });
  } catch (error) {
    console.error("organization employee count GET failed", error);
    return NextResponse.json(
      { error: "Failed to load employee count" },
      { status: 500 },
    );
  }
}
