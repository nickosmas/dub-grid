import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import logger from "@/lib/logger";

const MAX_ROWS = 500;

const rowSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email().or(z.literal("")).optional().default(""),
  phone: z.string().trim().optional().default(""),
  seniority: z.coerce.number().int().min(0).optional().default(0),
  focusAreaNames: z.string().trim().optional().default(""),
  certificationName: z.string().trim().optional().default(""),
  roleNames: z.string().trim().optional().default(""),
  contactNotes: z.string().trim().optional().default(""),
});

const bodySchema = z.object({
  orgId: z.string().uuid(),
  rows: z.array(rowSchema).min(1).max(MAX_ROWS),
});

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

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const userClient = getUserClient(req);
    const { data: { session } } = await userClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { orgId, rows } = parsed.data;
    const serviceClient = getServiceClient();

    // Permission check — parallelize independent queries
    const [{ data: membership }, { data: profile }] = await Promise.all([
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", session.user.id)
        .eq("org_id", orgId)
        .maybeSingle(),
      serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", session.user.id)
        .single(),
    ]);

    const isGridmaster = profile?.platform_role === "gridmaster";
    const isSuperAdmin = membership?.org_role === "super_admin";
    const canManage = membership?.org_role === "admin" &&
      (membership.admin_permissions as Record<string, boolean> | null)?.canManageEmployees;

    if (!isGridmaster && !isSuperAdmin && !canManage) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Fetch org's focus areas, certifications, and roles for name matching
    const [{ data: focusAreas }, { data: certs }, { data: orgRoles }] = await Promise.all([
      serviceClient.from("focus_areas").select("id, name").eq("org_id", orgId).is("archived_at", null),
      serviceClient.from("certifications").select("id, name").eq("org_id", orgId).is("archived_at", null),
      serviceClient.from("organization_roles").select("id, name").eq("org_id", orgId).is("archived_at", null),
    ]);

    const faNameMap = new Map((focusAreas ?? []).map((fa: Record<string, unknown>) => [(fa.name as string).toLowerCase(), fa.id as number]));
    const certNameMap = new Map((certs ?? []).map((c: Record<string, unknown>) => [(c.name as string).toLowerCase(), c.id as number]));
    const roleNameMap = new Map((orgRoles ?? []).map((r: Record<string, unknown>) => [(r.name as string).toLowerCase(), r.id as number]));

    // Resolve names to IDs and build insert records
    const errors: { row: number; error: string }[] = [];
    const insertRecords: { index: number; record: Record<string, unknown> }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Resolve focus area names to IDs
      const faIds: number[] = [];
      if (row.focusAreaNames) {
        for (const name of row.focusAreaNames.split(";").map((s) => s.trim()).filter(Boolean)) {
          const id = faNameMap.get(name.toLowerCase());
          if (id) faIds.push(id);
          else errors.push({ row: i + 1, error: `Unknown focus area: "${name}"` });
        }
      }

      // Resolve certification name
      let certId: number | null = null;
      if (row.certificationName) {
        certId = certNameMap.get(row.certificationName.toLowerCase()) ?? null;
        if (!certId) {
          errors.push({ row: i + 1, error: `Unknown certification: "${row.certificationName}"` });
        }
      }

      // Resolve role names
      const roleIds: number[] = [];
      if (row.roleNames) {
        for (const name of row.roleNames.split(";").map((s) => s.trim()).filter(Boolean)) {
          const id = roleNameMap.get(name.toLowerCase());
          if (id) roleIds.push(id);
          else errors.push({ row: i + 1, error: `Unknown role: "${name}"` });
        }
      }

      insertRecords.push({
        index: i,
        record: {
          org_id: orgId,
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email || "",
          phone: row.phone || "",
          seniority: row.seniority,
          focus_area_ids: faIds,
          certification_id: certId,
          role_ids: roleIds,
          contact_notes: row.contactNotes || "",
        },
      });
    }

    // Batch insert in chunks of 50 instead of one-at-a-time
    const BATCH_SIZE = 50;
    const inserted: { row: number; name: string }[] = [];

    for (let batchStart = 0; batchStart < insertRecords.length; batchStart += BATCH_SIZE) {
      const batch = insertRecords.slice(batchStart, batchStart + BATCH_SIZE);
      const { error: batchError } = await serviceClient
        .from("employees")
        .insert(batch.map((b) => b.record));

      if (batchError) {
        // If batch fails, fall back to individual inserts for this batch
        for (const item of batch) {
          const { error: insertError } = await serviceClient
            .from("employees")
            .insert(item.record);
          if (insertError) {
            errors.push({ row: item.index + 1, error: insertError.message });
          } else {
            inserted.push({ row: item.index + 1, name: `${item.record.first_name} ${item.record.last_name}` });
          }
        }
      } else {
        for (const item of batch) {
          inserted.push({ row: item.index + 1, name: `${item.record.first_name} ${item.record.last_name}` });
        }
      }
    }

    // Audit log
    await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: session.user.id,
      actor_email: session.user.email,
      action: "employee.created",
      resource_type: "employee",
      resource_id: null,
      details: { bulkImport: true, total: rows.length, inserted: inserted.length, errors: errors.length },
    });

    return NextResponse.json({
      success: true,
      inserted: inserted.length,
      errors,
      total: rows.length,
    });
  } catch (err) {
    logger.error({ error: err }, "Bulk import failed");
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
