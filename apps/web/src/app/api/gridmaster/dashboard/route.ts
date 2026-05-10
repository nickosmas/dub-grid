import { NextRequest, NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  requireGridmasterSession,
} from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { ORGANIZATION_WITH_BILLING_COLS } from "@/lib/db/shared";
import { rowToOrganization } from "@/lib/db/mappers";
import type { DbOrganization } from "@/lib/db/types";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    const service = getServiceClient();
    const userClient = createRequestSupabaseClient(req);
    const [organizationsResult, statsResult, platformUsersResult] = await Promise.all([
      service
        .from("organizations")
        .select(ORGANIZATION_WITH_BILLING_COLS)
        .order("name"),
      userClient.rpc("get_tenant_stats"),
      service
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .neq("platform_role", "gridmaster"),
    ]);

    if (organizationsResult.error) {
      throw organizationsResult.error;
    }
    if (statsResult.error) {
      throw statsResult.error;
    }
    if (platformUsersResult.error) {
      throw platformUsersResult.error;
    }

    return NextResponse.json({
      organizations: (organizationsResult.data ?? []).map((row) =>
        rowToOrganization(row as DbOrganization),
      ),
      platformUserCount: platformUsersResult.count ?? 0,
      stats: (statsResult.data ?? []).map(
        (row: { org_id: string; user_count: number; employee_count: number }) => ({
          orgId: row.org_id,
          userCount: Number(row.user_count),
          employeeCount: Number(row.employee_count),
        }),
      ),
    });
  } catch (error) {
    console.error("gridmaster dashboard GET failed", error);
    return NextResponse.json(
      { error: "Failed to load gridmaster dashboard data" },
      { status: 500 },
    );
  }
}
