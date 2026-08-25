import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { forbidIfSandboxCookie, requireAuthenticatedUser, requireFreshAuth } from "@/lib/api-auth";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

/**
 * GET /api/auth/data-export
 * GDPR Article 20: Right to data portability.
 * Returns all user data as a downloadable JSON file.
 * Rate limited to one export per hour.
 */
const GDPR_EXPORT_AUDIT_ACTION = "data.portability_exported";

export async function GET(req: NextRequest) {
  const sandboxBlock = forbidIfSandboxCookie(req);
  if (sandboxBlock) return sandboxBlock;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;
    // Exfiltrates the caller's full personal data: don't act on a locally
    // verified token that could be up to an hour old. Confirm with Supabase
    // Auth that this caller is still live.
    const stale = await requireFreshAuth(req, user.id);
    if (stale) return stale;

    const userId = user.id;
    const serviceClient = getServiceClient();

    // Rate limit: one export per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentExports } = await serviceClient
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("actor_id", userId)
      .eq("action", GDPR_EXPORT_AUDIT_ACTION)
      .gte("created_at", oneHourAgo);

    if ((recentExports ?? 0) > 0) {
      return NextResponse.json(
        { error: "You can export once an hour. Try again a bit later." },
        { status: 429 },
      );
    }

    // Query all user data in parallel
    const [
      profileResult,
      membershipsResult,
      employeesResult,
      auditResult,
      consentsResult,
      termsResult,
      notificationPrefsResult,
    ] = await Promise.all([
      serviceClient.from("profiles").select("*").eq("id", userId).single(),
      serviceClient.from("organization_memberships").select("*").eq("user_id", userId),
      serviceClient.from("employees").select("*").eq("user_id", userId),
      serviceClient
        .from("audit_log")
        .select("*")
        .eq("actor_id", userId)
        .order("created_at", { ascending: false })
        .limit(1000),
      serviceClient
        .from("cookie_consents")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      serviceClient
        .from("terms_acceptances")
        .select("*")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false }),
      serviceClient.from("notification_preferences").select("*").eq("user_id", userId),
    ]);

    // Fetch canonical schedule cells for linked employees.
    const employeeIds = (employeesResult.data ?? []).map((e: { id: string }) => e.id);
    let scheduleCells: unknown[] = [];
    if (employeeIds.length > 0) {
      const { data: scheduleCellData, error: scheduleCellError } = await serviceClient
        .from("schedule_cells")
        .select(
          `
          *,
          snapshots:schedule_cell_snapshots(
            *,
            segments:schedule_cell_segments(*)
          )
        `,
        )
        .in("emp_id", employeeIds)
        .order("date", { ascending: false })
        .limit(5000);

      if (scheduleCellError) throw scheduleCellError;
      scheduleCells = scheduleCellData ?? [];
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      email: user.email,
      profile: profileResult.data ?? null,
      organization_memberships: membershipsResult.data ?? [],
      employees: employeesResult.data ?? [],
      schedule_cells: scheduleCells,
      audit_log: auditResult.data ?? [],
      cookie_consents: consentsResult.data ?? [],
      terms_acceptances: termsResult.data ?? [],
      notification_preferences: notificationPrefsResult.data ?? [],
    };

    // Log the export to audit trail
    await serviceClient.from("audit_log").insert({
      actor_id: userId,
      actor_email: user.email,
      action: GDPR_EXPORT_AUDIT_ACTION,
      resource_type: "data_export",
      resource_id: userId,
      details: {
        tables_exported: 9,
        employee_count: employeeIds.length,
        schedule_record_count: scheduleCells.length,
      },
    });

    const dateStr = new Date().toISOString().split("T")[0];
    const json = JSON.stringify(exportData, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dubgrid-data-export-${dateStr}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "data-export" } });
    logger.error({ error: err }, "Data export failed");
    return NextResponse.json({ error: "Data export failed" }, { status: 500 });
  }
}
