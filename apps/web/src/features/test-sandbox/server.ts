import type { SupabaseClient, User } from "@supabase/supabase-js";

const MAX_SLUG_ATTEMPTS = 5;

// Strip auto-managed and audit columns when cloning a row.
const STRIP_FIELDS = new Set([
  "id",
  "org_id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
]);

function randomSandboxSlug(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36).slice(-6);
  return `sandbox-${stamp}${random}`;
}

interface Remapping {
  col: string;
  map: Map<number, number>;
  isArray?: boolean;
}

/**
 * Read every non-archived row of `table` belonging to `sourceOrgId`,
 * remap any FK columns through the supplied id maps, strip user-linkage
 * columns, and insert into `sandboxOrgId`. Returns a map of source row
 * id → new row id so downstream tables can resolve their own FK refs.
 */
async function cloneOrgTable(
  svc: SupabaseClient,
  table: string,
  sourceOrgId: string,
  sandboxOrgId: string,
  remappings: Remapping[] = [],
  extraStripFields: string[] = [],
): Promise<Map<number, number>> {
  const { data: rows, error } = await svc.from(table).select("*").eq("org_id", sourceOrgId);
  if (error) throw error;
  if (!rows || rows.length === 0) return new Map();

  // Deterministic order so the new rows come back in the same order we
  // sent them — PostgREST returns inserts in input order, which lets us
  // build the id remap by index.
  rows.sort((a, b) => Number(a.id) - Number(b.id));

  const stripAll = new Set([...STRIP_FIELDS, ...extraStripFields]);
  const newRows = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (stripAll.has(key)) continue;
      out[key] = value;
    }
    for (const r of remappings) {
      const val = out[r.col];
      if (val == null) continue;
      if (r.isArray) {
        out[r.col] = (val as number[])
          .map((srcId) => r.map.get(srcId))
          .filter((v): v is number => v != null);
      } else {
        const mapped = r.map.get(val as number);
        out[r.col] = mapped ?? null;
      }
    }
    out.org_id = sandboxOrgId;
    return out;
  });

  const { data: inserted, error: insErr } = await svc.from(table).insert(newRows).select("id");
  if (insErr) throw insErr;

  const map = new Map<number, number>();
  if (inserted) {
    for (let i = 0; i < rows.length; i += 1) {
      map.set(Number(rows[i].id), Number(inserted[i].id));
    }
  }
  return map;
}

/**
 * Clones org-scoped config + employees from a source org into a sandbox.
 * Mutating data (schedule_cells, snapshots, recurring shifts, requests,
 * notes) is intentionally NOT copied — the sandbox starts with a fresh
 * empty schedule so the user can experiment without seeing real shifts.
 */
async function cloneOrgIntoSandbox(
  svc: SupabaseClient,
  sourceOrgId: string,
  sandboxOrgId: string,
): Promise<void> {
  // Phase 1 — truly independent tables (only FK is org_id)
  const [departmentMap, absenceMap, indicatorMap] = await Promise.all([
    cloneOrgTable(svc, "departments", sourceOrgId, sandboxOrgId),
    cloneOrgTable(svc, "absence_types", sourceOrgId, sandboxOrgId),
    cloneOrgTable(svc, "indicator_types", sourceOrgId, sandboxOrgId),
  ]);

  // Phase 2 — depend on departments. Certifications has a
  // department_id FK that ON DELETE SET NULLs to source departments if
  // we forget to remap it — meaning cloned certs end up linked to the
  // source organization's departments. Remap fixes that.
  const [focusAreaMap, roleMap, certificationMap] = await Promise.all([
    cloneOrgTable(svc, "focus_areas", sourceOrgId, sandboxOrgId, [
      { col: "department_id", map: departmentMap },
    ]),
    cloneOrgTable(svc, "organization_roles", sourceOrgId, sandboxOrgId, [
      { col: "department_id", map: departmentMap },
    ]),
    cloneOrgTable(svc, "certifications", sourceOrgId, sandboxOrgId, [
      { col: "department_id", map: departmentMap },
    ]),
  ]);

  // Phase 3 — shift categories depend on focus areas
  const shiftCategoryMap = await cloneOrgTable(svc, "shift_categories", sourceOrgId, sandboxOrgId, [
    { col: "focus_area_id", map: focusAreaMap },
  ]);

  // Phase 4 — jobs depend on focus areas, shift categories, departments,
  // roles, and certifications.
  await cloneOrgTable(svc, "jobs", sourceOrgId, sandboxOrgId, [
    { col: "focus_area_ids", map: focusAreaMap, isArray: true },
    { col: "applicable_shift_ids", map: shiftCategoryMap, isArray: true },
    { col: "department_ids", map: departmentMap, isArray: true },
    { col: "eligible_role_ids", map: roleMap, isArray: true },
    { col: "required_certification_ids", map: certificationMap, isArray: true },
  ]);

  // Phase 5 — employees. Strip user_id so the cloned employees are
  // detached from any auth user (they're test data, not linked to real
  // accounts). version is server-managed so let the default kick in.
  await cloneOrgTable(
    svc,
    "employees",
    sourceOrgId,
    sandboxOrgId,
    [
      { col: "certification_id", map: certificationMap },
      { col: "focus_area_ids", map: focusAreaMap, isArray: true },
      { col: "department_ids", map: departmentMap, isArray: true },
      { col: "dept_admin_ids", map: departmentMap, isArray: true },
      { col: "role_ids", map: roleMap, isArray: true },
    ],
    ["user_id", "version"],
  );

  // Silence unused-var lint for maps that aren't referenced again
  void absenceMap;
  void indicatorMap;
}

/**
 * Returns the active sandbox org owned by this user, if any. We only ever
 * keep one sandbox alive per user — entering twice just re-attaches to the
 * existing one.
 */
export async function findActiveSandboxForUser(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<{ id: string; slug: string | null } | null> {
  const { data, error } = await serviceClient
    .from("organizations")
    .select("id, slug")
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; slug: string | null } | null) ?? null;
}

/**
 * Create a fresh sandbox organization owned by `actor`, seeded with a clone
 * of the source org's config (focus areas, departments, jobs, shift
 * categories, certifications, roles, absence types, indicator types) and
 * its employees. Returns the new sandbox's id + slug.
 */
export async function createSandboxForUser(input: {
  serviceClient: SupabaseClient;
  actor: User;
  sourceOrgId: string;
}): Promise<{ id: string; slug: string }> {
  const { serviceClient, actor, sourceOrgId } = input;

  // Copy as much of the source org row as we can so the sandbox feels
  // identical to the real organization. Anything Stripe-, suspension-, or
  // sandbox-specific is replaced below.
  const { data: sourceOrg, error: sourceErr } = await serviceClient
    .from("organizations")
    .select(
      "name, address, address_line_1, address_line_2, address_city, address_state, address_postal_code, address_country, phone, employee_count, logo_url, app_name, meta_description, theme_config, landing_page_config, focus_area_label, certification_label, role_label, department_label, shift_display_mode, timezone, pay_period_start_date, data_retention_days, enforce_conflict_prevention, coverage_rule_config, feature_overrides",
    )
    .eq("id", sourceOrgId)
    .maybeSingle();
  if (sourceErr) throw sourceErr;

  let createdOrgId: string | null = null;
  let createdSlug: string | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = randomSandboxSlug();
    const { data: orgRow, error: insertErr } = await serviceClient
      .from("organizations")
      .insert({
        name: sourceOrg?.name ? `${sourceOrg.name} — Sandbox` : "Sandbox organization",
        slug,
        workspace_kind: "sandbox",
        sandbox_owner_user_id: actor.id,
        sandbox_source_org_id: sourceOrgId,
        // Display + label clones
        focus_area_label: sourceOrg?.focus_area_label ?? null,
        certification_label: sourceOrg?.certification_label ?? null,
        role_label: sourceOrg?.role_label ?? null,
        department_label: sourceOrg?.department_label ?? null,
        shift_display_mode: sourceOrg?.shift_display_mode ?? "code",
        timezone: sourceOrg?.timezone ?? "UTC",
        pay_period_start_date: sourceOrg?.pay_period_start_date ?? null,
        // Address + contact (so the sandbox feels like a real org)
        address: sourceOrg?.address ?? "",
        address_line_1: sourceOrg?.address_line_1 ?? "",
        address_line_2: sourceOrg?.address_line_2 ?? "",
        address_city: sourceOrg?.address_city ?? "",
        address_state: sourceOrg?.address_state ?? "",
        address_postal_code: sourceOrg?.address_postal_code ?? "",
        address_country: sourceOrg?.address_country ?? "",
        phone: sourceOrg?.phone ?? "",
        employee_count: sourceOrg?.employee_count ?? null,
        // Branding + presentation
        logo_url: sourceOrg?.logo_url ?? null,
        app_name: sourceOrg?.app_name ?? null,
        meta_description: sourceOrg?.meta_description ?? null,
        theme_config: sourceOrg?.theme_config ?? {},
        landing_page_config: sourceOrg?.landing_page_config ?? {},
        // Operational config
        data_retention_days: sourceOrg?.data_retention_days ?? 365,
        enforce_conflict_prevention: sourceOrg?.enforce_conflict_prevention ?? false,
        coverage_rule_config: sourceOrg?.coverage_rule_config ?? {
          mentoredCoverageCreditPercent: 100,
        },
        feature_overrides: sourceOrg?.feature_overrides ?? {},
        // Sandboxes are exempt from billing gates — never inherit
        // subscription state from the source.
        subscription_status: "active",
        trial_ends_at: null,
      })
      .select("id, slug")
      .maybeSingle();
    if (!insertErr && orgRow) {
      createdOrgId = orgRow.id as string;
      createdSlug = (orgRow.slug as string | null) ?? slug;
      break;
    }
    lastError = insertErr;
    if (insertErr?.code !== "23505") {
      throw insertErr;
    }
  }
  if (!createdOrgId || !createdSlug) {
    throw lastError ?? new Error("Could not allocate a sandbox organization.");
  }

  try {
    // Add the actor as super_admin so RLS lets them touch the sandbox
    // like any organization they belong to.
    const { error: membershipErr } = await serviceClient.from("organization_memberships").insert({
      user_id: actor.id,
      org_id: createdOrgId,
      org_role: "super_admin",
      onboarding_completed_at: new Date().toISOString(),
    });
    if (membershipErr) throw membershipErr;

    // Clone the source org's structural config and people.
    await cloneOrgIntoSandbox(serviceClient, sourceOrgId, createdOrgId);
  } catch (err) {
    // Best-effort cleanup — if any step after the org insert fails, drop
    // the half-built sandbox so the user isn't left with a broken row.
    await serviceClient.from("organizations").delete().eq("id", createdOrgId);
    throw err;
  }

  return { id: createdOrgId, slug: createdSlug };
}

/**
 * Hard-delete EVERY sandbox org owned by `actor`, not just one. The
 * original implementation only deleted the org pointed at by the cookie,
 * which left orphans behind whenever an exit happened with a missing
 * cookie (closed tab, expired session). Those orphans then got "reused"
 * by the next Enter via findActiveSandboxForUser, so the user saw
 * yesterday's sandbox data come back. Deleting all owned sandboxes makes
 * Exit guaranteed-clean regardless of cookie state.
 *
 * FK cascades take care of memberships, focus areas, departments,
 * schedule rows, etc.
 */
export async function deleteSandboxForUser(input: {
  serviceClient: SupabaseClient;
  actor: User;
}): Promise<{ deletedCount: number }> {
  const { data: owned, error } = await input.serviceClient
    .from("organizations")
    .select("id")
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", input.actor.id);
  if (error) throw error;
  if (!owned || owned.length === 0) return { deletedCount: 0 };

  const ids = owned.map((row) => row.id as string);
  const { error: deleteError } = await input.serviceClient
    .from("organizations")
    .delete()
    .in("id", ids);
  if (deleteError) throw deleteError;
  return { deletedCount: ids.length };
}
