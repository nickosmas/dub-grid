import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import logger from "@/lib/logger";

function getUserClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    },
  );
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/auth/data-export
 * GDPR Article 20: Right to data portability.
 * Returns all user data as a downloadable JSON file.
 * Rate limited to one export per hour.
 */
export async function GET(req: NextRequest) {
  try {
    const userClient = getUserClient(req);
    const { data: { session } } = await userClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const userId = session.user.id;
    const serviceClient = getServiceClient();

    // Rate limit: one export per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentExports } = await serviceClient
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("actor_id", userId)
      .eq("action", "data.exported")
      .gte("created_at", oneHourAgo);

    if ((recentExports ?? 0) > 0) {
      return NextResponse.json(
        { error: "Data export is limited to once per hour. Please try again later." },
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
      serviceClient.from("audit_log").select("*").eq("actor_id", userId).order("created_at", { ascending: false }).limit(1000),
      serviceClient.from("cookie_consents").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      serviceClient.from("terms_acceptances").select("*").eq("user_id", userId).order("accepted_at", { ascending: false }),
      serviceClient.from("notification_preferences").select("*").eq("user_id", userId),
    ]);

    // Fetch shifts for linked employees
    const employeeIds = (employeesResult.data ?? []).map((e: { id: string }) => e.id);
    let shifts: unknown[] = [];
    if (employeeIds.length > 0) {
      const { data: shiftData } = await serviceClient
        .from("shifts")
        .select("*")
        .in("emp_id", employeeIds)
        .order("date", { ascending: false })
        .limit(5000);
      shifts = shiftData ?? [];
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      email: session.user.email,
      profile: profileResult.data ?? null,
      organization_memberships: membershipsResult.data ?? [],
      employees: employeesResult.data ?? [],
      shifts,
      audit_log: auditResult.data ?? [],
      cookie_consents: consentsResult.data ?? [],
      terms_acceptances: termsResult.data ?? [],
      notification_preferences: notificationPrefsResult.data ?? [],
    };

    // Log the export to audit trail
    await serviceClient.from("audit_log").insert({
      actor_id: userId,
      actor_email: session.user.email,
      action: "data.exported",
      resource_type: "data_export",
      resource_id: userId,
      details: {
        tables_exported: 8,
        employee_count: employeeIds.length,
        shift_count: shifts.length,
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
    logger.error({ error: err }, "Data export failed");
    return NextResponse.json({ error: "Data export failed" }, { status: 500 });
  }
}
