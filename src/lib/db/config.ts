import {
  supabase, cacheThrough, cacheDel, CacheKey, TTL,
  FOCUS_AREA_COLS, SHIFT_CODE_COLS, SHIFT_CATEGORY_COLS, NAMED_ITEM_COLS,
  COVERAGE_REQ_COLS, ABSENCE_TYPE_COLS, INDICATOR_TYPE_COLS,
  logAudit,
} from "./shared";
import type {
  DbFocusArea, DbShiftCode, DbShiftCategory, DbNamedItem,
  DbCoverageRequirement, DbAbsenceType, DbIndicatorType,
} from "./types";
import {
  rowToFocusArea, rowToShiftCode, rowToShiftCategory, rowToNamedItem,
  rowToCoverageRequirement, rowToAbsenceType, rowToIndicatorType,
} from "./mappers";
import type {
  FocusArea, ShiftCode, ShiftCategory, NamedItem,
  CoverageRequirement, AbsenceType, IndicatorType,
} from "@/types";

// ── Dependency Checks ────────────────────────────────────────────────────────
// Before archiving any config item, check if it's referenced elsewhere.
// Returns a summary string for the UI warning dialog.

export interface DependencyInfo {
  hasDependencies: boolean;
  summary: string;
}

function buildSummary(parts: string[]): DependencyInfo {
  const active = parts.filter(Boolean);
  if (active.length === 0) return { hasDependencies: false, summary: "" };
  return { hasDependencies: true, summary: `Used by ${active.join(" and ")}` };
}

export async function checkRoleDependencies(roleId: number, orgId: string): Promise<DependencyInfo> {
  const { count } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("archived_at", null)
    .contains("role_ids", [roleId]);
  return buildSummary([count ? `${count} employee${count !== 1 ? "s" : ""}` : ""]);
}

export async function checkCertificationDependencies(certId: number, orgId: string): Promise<DependencyInfo> {
  const [empRes, codeRes] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).eq("certification_id", certId),
    supabase.from("shift_codes").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).contains("required_certification_ids", [certId]),
  ]);
  return buildSummary([
    empRes.count ? `${empRes.count} employee${empRes.count !== 1 ? "s" : ""}` : "",
    codeRes.count ? `${codeRes.count} shift code${codeRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

export async function checkFocusAreaDependencies(faId: number, orgId: string): Promise<DependencyInfo> {
  const [empRes, codeRes, covRes] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).contains("focus_area_ids", [faId]),
    supabase.from("shift_codes").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).eq("focus_area_id", faId),
    supabase.from("coverage_requirements").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("focus_area_id", faId),
  ]);
  return buildSummary([
    empRes.count ? `${empRes.count} employee${empRes.count !== 1 ? "s" : ""}` : "",
    codeRes.count ? `${codeRes.count} shift code${codeRes.count !== 1 ? "s" : ""}` : "",
    covRes.count ? `${covRes.count} coverage requirement${covRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

export async function checkShiftCodeDependencies(codeId: number, orgId: string): Promise<DependencyInfo> {
  const [shiftRes, recurRes, covRes] = await Promise.all([
    supabase.from("shifts").select("emp_id, employees!inner(archived_at)", { count: "exact", head: true }).eq("org_id", orgId).is("employees.archived_at", null).or(`draft_shift_code_ids.cs.{${codeId}},published_shift_code_ids.cs.{${codeId}}`),
    supabase.from("recurring_shifts").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).eq("shift_code_id", codeId),
    supabase.from("coverage_requirements").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("shift_code_id", codeId),
  ]);
  return buildSummary([
    shiftRes.count ? `${shiftRes.count} shift${shiftRes.count !== 1 ? "s" : ""}` : "",
    recurRes.count ? `${recurRes.count} recurring template${recurRes.count !== 1 ? "s" : ""}` : "",
    covRes.count ? `${covRes.count} coverage requirement${covRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

export async function checkShiftCategoryDependencies(catId: number, orgId: string): Promise<DependencyInfo> {
  const { count } = await supabase
    .from("shift_codes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("archived_at", null)
    .eq("category_id", catId);
  return buildSummary([count ? `${count} shift code${count !== 1 ? "s" : ""}` : ""]);
}

export async function checkAbsenceTypeDependencies(atId: number, orgId: string): Promise<DependencyInfo> {
  const [shiftRes, recurRes] = await Promise.all([
    supabase.from("shifts").select("emp_id, employees!inner(archived_at)", { count: "exact", head: true }).eq("org_id", orgId).is("employees.archived_at", null).or(`draft_absence_type_id.eq.${atId},published_absence_type_id.eq.${atId}`),
    supabase.from("recurring_shifts").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null).eq("absence_type_id", atId),
  ]);
  return buildSummary([
    shiftRes.count ? `${shiftRes.count} shift${shiftRes.count !== 1 ? "s" : ""}` : "",
    recurRes.count ? `${recurRes.count} recurring template${recurRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

export async function checkIndicatorTypeDependencies(itId: number, orgId: string): Promise<DependencyInfo> {
  const { count } = await supabase
    .from("schedule_notes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("indicator_type_id", itId);
  return buildSummary([count ? `${count} schedule note${count !== 1 ? "s" : ""}` : ""]);
}

// ── Certifications ───────────────────────────────────────────────────────────

export async function fetchCertifications(orgId: string, includeArchived = false): Promise<NamedItem[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.certifications(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select(NAMED_ITEM_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbNamedItem[]).map(rowToNamedItem);
    });
  }
  const query = supabase
    .from("certifications")
    .select(NAMED_ITEM_COLS)
    .eq("org_id", orgId);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return (data as DbNamedItem[]).map(rowToNamedItem);
}

export async function saveCertifications(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
): Promise<NamedItem[]> {
  const existingIds = new Set(existing.map((e) => e.id));
  const newIds = new Set(items.filter((i) => i.id).map((i) => i.id));

  // Soft-delete removed items (row persists — all FK/array references remain valid)
  const toDelete = existing.filter((e) => !newIds.has(e.id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("certifications")
      .update({ archived_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .in("id", toDelete.map((d) => d.id));
    if (error) throw error;
  }

  // Separate update + insert to avoid GENERATED ALWAYS identity column errors
  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

  for (const { item, sortOrder } of toUpdate) {
    const { error } = await supabase
      .from("certifications")
      .update({ name: item.name, abbr: item.abbr, department_id: item.departmentId ?? null, sort_order: sortOrder })
      .eq("org_id", orgId)
      .eq("id", item.id);
    if (error) throw error;
  }
  // Insert new items — restore archived rows with matching names instead of inserting duplicates
  for (const { item, sortOrder } of toInsert) {
    const { data: archived } = await supabase
      .from("certifications")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", item.name)
      .not("archived_at", "is", null)
      .maybeSingle();
    if (archived) {
      const { error } = await supabase
        .from("certifications")
        .update({ name: item.name, abbr: item.abbr, department_id: item.departmentId ?? null, sort_order: sortOrder, archived_at: null })
        .eq("id", archived.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("certifications")
        .insert({ org_id: orgId, name: item.name, abbr: item.abbr, department_id: item.departmentId ?? null, sort_order: sortOrder });
      if (error) throw error;
    }
  }

  await cacheDel(CacheKey.certifications(orgId), CacheKey.shiftCodes(orgId), CacheKey.shiftCodes(orgId, true));
  void logAudit("certifications.saved", "certification", null, { created: toInsert.length, updated: toUpdate.length, archived: toDelete.length }, orgId);
  return fetchCertifications(orgId);
}

export async function restoreCertification(certId: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("certifications")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", certId);
  if (error) throw error;
  await cacheDel(CacheKey.certifications(orgId));
  void logAudit("certification.restored", "certification", String(certId), {}, orgId);
}

// ── Organization Roles ───────────────────────────────────────────────────────

export async function fetchOrganizationRoles(orgId: string, includeArchived = false): Promise<NamedItem[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.orgRoles(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("organization_roles")
        .select(NAMED_ITEM_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbNamedItem[]).map(rowToNamedItem);
    });
  }
  const query = supabase
    .from("organization_roles")
    .select(NAMED_ITEM_COLS)
    .eq("org_id", orgId);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return (data as DbNamedItem[]).map(rowToNamedItem);
}

export async function saveOrganizationRoles(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
): Promise<NamedItem[]> {
  const existingIds = new Set(existing.map((e) => e.id));
  const newIds = new Set(items.filter((i) => i.id).map((i) => i.id));

  // Soft-delete removed items (row persists — all FK/array references remain valid)
  const toDelete = existing.filter((e) => !newIds.has(e.id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("organization_roles")
      .update({ archived_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .in("id", toDelete.map((d) => d.id));
    if (error) throw error;
  }

  // Separate update + insert to avoid GENERATED ALWAYS identity column errors
  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

  for (const { item, sortOrder } of toUpdate) {
    const { error } = await supabase
      .from("organization_roles")
      .update({ name: item.name, abbr: item.abbr, department_id: item.departmentId ?? null, sort_order: sortOrder })
      .eq("org_id", orgId)
      .eq("id", item.id);
    if (error) throw error;
  }
  // Insert new items — restore archived rows with matching names instead of inserting duplicates
  for (const { item, sortOrder } of toInsert) {
    const { data: archived } = await supabase
      .from("organization_roles")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", item.name)
      .not("archived_at", "is", null)
      .maybeSingle();
    if (archived) {
      const { error } = await supabase
        .from("organization_roles")
        .update({ name: item.name, abbr: item.abbr, department_id: item.departmentId ?? null, sort_order: sortOrder, archived_at: null })
        .eq("id", archived.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("organization_roles")
        .insert({ org_id: orgId, name: item.name, abbr: item.abbr, department_id: item.departmentId ?? null, sort_order: sortOrder });
      if (error) throw error;
    }
  }

  await cacheDel(CacheKey.orgRoles(orgId));
  void logAudit("org_roles.saved", "org_role", null, { created: toInsert.length, updated: toUpdate.length, archived: toDelete.length }, orgId);
  return fetchOrganizationRoles(orgId);
}

export async function restoreOrganizationRole(roleId: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("organization_roles")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", roleId);
  if (error) throw error;
  await cacheDel(CacheKey.orgRoles(orgId));
  void logAudit("org_role.restored", "org_role", String(roleId), {}, orgId);
}

// ── Focus Areas ──────────────────────────────────────────────────────────────

export async function fetchFocusAreas(orgId: string, includeArchived = false): Promise<FocusArea[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.focusAreas(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("focus_areas")
        .select(FOCUS_AREA_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbFocusArea[]).map(rowToFocusArea);
    });
  }
  const { data, error } = await supabase
    .from("focus_areas")
    .select(FOCUS_AREA_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (error) throw error;
  return (data as DbFocusArea[]).map(rowToFocusArea);
}

/**
 * Auto-migration: if focus areas exist without a department_id and no scheduled
 * departments exist yet, create a default scheduled department and assign all
 * orphaned focus areas to it.
 * - 1 FA: department takes the FA's name
 * - 2+ FAs: department is named "Schedule"
 * Returns true if migration occurred, false if not needed.
 */
export async function autoMigrateOrphanedFocusAreas(orgId: string): Promise<boolean> {
  // Late import to avoid circular dependency — fetchDepartments lives in a sibling module
  const { fetchDepartments } = await import("./employees");

  const [depts, fas] = await Promise.all([
    fetchDepartments(orgId),
    fetchFocusAreas(orgId),
  ]);

  const scheduledDepts = depts.filter((d: { type: string }) => d.type === 'scheduled');
  const orphanedFAs = fas.filter(fa => fa.departmentId === null);

  // Nothing to migrate if there are scheduled depts or no orphaned FAs
  if (scheduledDepts.length > 0 || orphanedFAs.length === 0) return false;

  // Create a default scheduled department
  const deptName = orphanedFAs.length === 1 ? orphanedFAs[0].name : "Schedule";
  const { data: inserted, error: insertErr } = await supabase
    .from("departments")
    .insert({ org_id: orgId, name: deptName, abbr: "", type: "scheduled", sort_order: 0 })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  const newDeptId = inserted.id as number;

  // Assign all orphaned FAs to this department
  const faIds = orphanedFAs.map(fa => fa.id);
  const { error: updateErr } = await supabase
    .from("focus_areas")
    .update({ department_id: newDeptId })
    .in("id", faIds);
  if (updateErr) throw updateErr;

  // Bust caches
  await cacheDel(CacheKey.departments(orgId), CacheKey.focusAreas(orgId));
  return true;
}

export async function upsertFocusArea(focusArea: Omit<FocusArea, "id"> & { id?: number }): Promise<FocusArea> {
  const row = {
    org_id: focusArea.orgId,
    department_id: focusArea.departmentId ?? null,
    name: focusArea.name,
    color_bg: focusArea.colorBg,
    color_text: focusArea.colorText,
    sort_order: focusArea.sortOrder,
  };
  if (focusArea.id) {
    const { data, error } = await supabase
      .from("focus_areas")
      .update(row)
      .eq("id", focusArea.id)
      .select()
      .single();
    if (error) throw error;
    await cacheDel(CacheKey.focusAreas(focusArea.orgId));
    void logAudit("focus_area.upserted", "focus_area", String(focusArea.id), { name: focusArea.name }, focusArea.orgId);
    return rowToFocusArea(data as DbFocusArea);
  }
  const { data, error } = await supabase
    .from("focus_areas")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.focusAreas(focusArea.orgId));
  const result = rowToFocusArea(data as DbFocusArea);
  void logAudit("focus_area.upserted", "focus_area", String(result.id), { name: focusArea.name }, focusArea.orgId);
  return result;
}

export async function deleteFocusArea(focusAreaId: number, orgId: string): Promise<void> {
  const now = new Date().toISOString();

  // Archive dependent shift_codes for this focus area
  const { error: scErr } = await supabase
    .from("shift_codes")
    .update({ archived_at: now })
    .eq("org_id", orgId)
    .eq("focus_area_id", focusAreaId)
    .is("archived_at", null);
  if (scErr) throw scErr;

  // Archive dependent shift_categories for this focus area
  const { error: catErr } = await supabase
    .from("shift_categories")
    .update({ archived_at: now })
    .eq("org_id", orgId)
    .eq("focus_area_id", focusAreaId)
    .is("archived_at", null);
  if (catErr) throw catErr;

  // Remove this focus area from employee focusAreaIds arrays (single batch UPDATE via RPC)
  const { error: empErr } = await supabase.rpc("remove_focus_area_from_employees", {
    p_focus_area_id: focusAreaId,
  });
  if (empErr) throw empErr;

  // Soft-delete the focus area (row persists — all FK/array references remain valid)
  const { error } = await supabase
    .from("focus_areas")
    .update({ archived_at: now })
    .eq("org_id", orgId)
    .eq("id", focusAreaId);
  if (error) throw error;
  await cacheDel(
    CacheKey.focusAreas(orgId),
    CacheKey.shiftCodes(orgId), CacheKey.shiftCodes(orgId, true),
    CacheKey.shiftCategories(orgId),
    CacheKey.employees(orgId),
    CacheKey.coverageReqs(orgId),
  );
  void logAudit("focus_area.archived", "focus_area", String(focusAreaId), {}, orgId);
}

export async function restoreFocusArea(focusAreaId: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("focus_areas")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", focusAreaId);
  if (error) throw error;
  await cacheDel(CacheKey.focusAreas(orgId));
  void logAudit("focus_area.restored", "focus_area", String(focusAreaId), {}, orgId);
}

// ── Shift Codes ──────────────────────────────────────────────────────────────

export async function fetchShiftCodes(orgId: string, includeArchived = false): Promise<ShiftCode[]> {
  return cacheThrough(CacheKey.shiftCodes(orgId, includeArchived), TTL.STABLE, async () => {
    let query = supabase
      .from("shift_codes")
      .select(SHIFT_CODE_COLS)
      .eq("org_id", orgId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("sort_order");
    if (error) throw error;
    return (data as DbShiftCode[]).map(rowToShiftCode);
  });
}

export async function fetchShiftCategories(orgId: string, includeArchived = false): Promise<ShiftCategory[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.shiftCategories(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("shift_categories")
        .select(SHIFT_CATEGORY_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbShiftCategory[]).map(rowToShiftCategory);
    });
  }
  const { data, error } = await supabase
    .from("shift_categories")
    .select(SHIFT_CATEGORY_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (error) throw error;
  return (data as DbShiftCategory[]).map(rowToShiftCategory);
}

export async function upsertShiftCategory(
  cat: Omit<ShiftCategory, "id"> & { id?: number }
): Promise<ShiftCategory> {
  const row = {
    org_id: cat.orgId,
    name: cat.name,
    color: cat.color,
    start_time: cat.startTime ?? null,
    end_time: cat.endTime ?? null,
    sort_order: cat.sortOrder,
    focus_area_id: cat.focusAreaId ?? null,
    break_minutes: cat.breakMinutes ?? null,
  };
  if (cat.id) {
    const { data, error } = await supabase
      .from("shift_categories")
      .update(row)
      .eq("id", cat.id)
      .select()
      .single();
    if (error) throw error;
    await cacheDel(CacheKey.shiftCategories(cat.orgId));
    void logAudit("shift_category.upserted", "shift_category", String(cat.id), { name: cat.name }, cat.orgId);
    return rowToShiftCategory(data as DbShiftCategory);
  }
  const { data, error } = await supabase
    .from("shift_categories")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(cat.orgId));
  void logAudit("shift_category.upserted", "shift_category", String((data as DbShiftCategory).id), { name: cat.name }, cat.orgId);
  return rowToShiftCategory(data as DbShiftCategory);
}

export async function deleteShiftCategory(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(orgId));
  void logAudit("shift_category.archived", "shift_category", String(id), {}, orgId);
}

export async function restoreShiftCategory(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_categories")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(orgId));
  void logAudit("shift_category.restored", "shift_category", String(id), {}, orgId);
}

// ── Coverage Requirements ────────────────────────────────────────────────────

export async function fetchCoverageRequirements(orgId: string): Promise<CoverageRequirement[]> {
  return cacheThrough(CacheKey.coverageReqs(orgId), TTL.STABLE, async () => {
    const { data, error } = await supabase
      .from("coverage_requirements")
      .select(COVERAGE_REQ_COLS)
      .eq("org_id", orgId);
    if (error) throw error;
    return (data as DbCoverageRequirement[]).map(rowToCoverageRequirement);
  });
}

/**
 * Batch save coverage requirements for a (focus_area, shift_code) combo.
 * Replaces all existing rows for that combo (delete + insert).
 */
export async function saveCoverageRequirements(
  orgId: string,
  focusAreaId: number,
  shiftCodeId: number,
  requirements: { dayOfWeek: number | null; minStaff: number }[],
): Promise<CoverageRequirement[]> {
  // Delete existing rows for this combo
  const { error: delError } = await supabase
    .from("coverage_requirements")
    .delete()
    .eq("org_id", orgId)
    .eq("focus_area_id", focusAreaId)
    .eq("shift_code_id", shiftCodeId);
  if (delError) throw delError;

  // Filter out zero-value rows and insert
  const rows = requirements
    .filter((r) => r.minStaff > 0)
    .map((r) => ({
      org_id: orgId,
      focus_area_id: focusAreaId,
      shift_code_id: shiftCodeId,
      day_of_week: r.dayOfWeek,
      min_staff: r.minStaff,
    }));

  if (rows.length === 0) {
    await cacheDel(CacheKey.coverageReqs(orgId));
    void logAudit("coverage_requirements.saved", "coverage_requirement", `${focusAreaId}_${shiftCodeId}`, { count: 0 }, orgId);
    return [];
  }

  const { data, error } = await supabase
    .from("coverage_requirements")
    .insert(rows)
    .select();
  if (error) throw error;
  await cacheDel(CacheKey.coverageReqs(orgId));
  void logAudit("coverage_requirements.saved", "coverage_requirement", `${focusAreaId}_${shiftCodeId}`, { count: rows.length }, orgId);
  return (data as DbCoverageRequirement[]).map(rowToCoverageRequirement);
}

export async function upsertShiftCode(
  st: Omit<ShiftCode, "id"> & { id?: number }
): Promise<ShiftCode> {
  const row = {
    org_id: st.orgId,
    label: st.label,
    name: st.name,
    color: st.color,
    border_color: st.border,
    text_color: st.text,
    category_id: st.categoryId ?? null,
    is_general: st.isGeneral ?? false,
    focus_area_id: st.focusAreaId ?? null,
    sort_order: st.sortOrder,
    required_certification_ids: st.requiredCertificationIds ?? [],
    default_start_time: st.defaultStartTime ?? null,
    default_end_time: st.defaultEndTime ?? null,
    default_duration_hours: st.defaultDurationHours ?? null,
    default_duration_minutes: st.defaultDurationMinutes ?? null,
  };

  let saved: DbShiftCode;
  if (st.id) {
    const { data, error } = await supabase
      .from("shift_codes")
      .update(row)
      .eq("id", st.id)
      .select()
      .single();
    if (error) throw error;
    saved = data as DbShiftCode;
  } else {
    const { data, error } = await supabase
      .from("shift_codes")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    saved = data as DbShiftCode;
  }

  await cacheDel(CacheKey.shiftCodes(st.orgId), CacheKey.shiftCodes(st.orgId, true), CacheKey.coverageReqs(st.orgId));
  void logAudit("shift_code.upserted", "shift_code", String(saved.id), { label: st.label, name: st.name }, st.orgId);
  return rowToShiftCode(saved);
}

export async function deleteShiftCode(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_codes")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCodes(orgId), CacheKey.shiftCodes(orgId, true), CacheKey.coverageReqs(orgId));
  void logAudit("shift_code.archived", "shift_code", String(id), {}, orgId);
}

export async function restoreShiftCode(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_codes")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCodes(orgId), CacheKey.shiftCodes(orgId, true), CacheKey.coverageReqs(orgId));
  void logAudit("shift_code.restored", "shift_code", String(id), {}, orgId);
}

// ── Absence Types ────────────────────────────────────────────────────────────

export async function fetchAbsenceTypes(orgId: string, includeArchived = false): Promise<AbsenceType[]> {
  return cacheThrough(CacheKey.absenceTypes(orgId, includeArchived), TTL.STABLE, async () => {
    let query = supabase
      .from("absence_types")
      .select(ABSENCE_TYPE_COLS)
      .eq("org_id", orgId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("sort_order");
    if (error) throw error;
    return (data as DbAbsenceType[]).map(rowToAbsenceType);
  });
}

export async function upsertAbsenceType(
  at: Omit<AbsenceType, "id"> & { id?: number }
): Promise<AbsenceType> {
  const row = {
    org_id: at.orgId,
    label: at.label,
    name: at.name,
    color: at.color,
    border_color: at.border,
    text_color: at.text,
    sort_order: at.sortOrder,
  };

  let saved: DbAbsenceType;
  if (at.id) {
    const { data, error } = await supabase
      .from("absence_types")
      .update(row)
      .eq("id", at.id)
      .select()
      .single();
    if (error) throw error;
    saved = data as DbAbsenceType;
  } else {
    const { data, error } = await supabase
      .from("absence_types")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    saved = data as DbAbsenceType;
  }

  await cacheDel(CacheKey.absenceTypes(at.orgId), CacheKey.absenceTypes(at.orgId, true));
  void logAudit("absence_type.upserted", "absence_type", String(saved.id), { label: at.label, name: at.name }, at.orgId);
  return rowToAbsenceType(saved);
}

export async function deleteAbsenceType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("absence_types")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.absenceTypes(orgId), CacheKey.absenceTypes(orgId, true));
  void logAudit("absence_type.archived", "absence_type", String(id), {}, orgId);
}

export async function restoreAbsenceType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("absence_types")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.absenceTypes(orgId), CacheKey.absenceTypes(orgId, true));
  void logAudit("absence_type.restored", "absence_type", String(id), {}, orgId);
}

// ── Indicator Types ──────────────────────────────────────────────────────────

export async function fetchIndicatorTypes(orgId: string, includeArchived = false): Promise<IndicatorType[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.indicatorTypes(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("indicator_types")
        .select(INDICATOR_TYPE_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbIndicatorType[]).map(rowToIndicatorType);
    });
  }
  const { data, error } = await supabase
    .from("indicator_types")
    .select(INDICATOR_TYPE_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (error) throw error;
  return (data as DbIndicatorType[]).map(rowToIndicatorType);
}

export async function upsertIndicatorType(
  indicator: Omit<IndicatorType, "id"> & { id?: number }
): Promise<IndicatorType> {
  const row = {
    org_id: indicator.orgId,
    name: indicator.name,
    color: indicator.color,
    sort_order: indicator.sortOrder,
  };
  if (indicator.id) {
    const { data, error } = await supabase
      .from("indicator_types")
      .update(row)
      .eq("id", indicator.id)
      .select()
      .single();
    if (error) throw error;
    await cacheDel(CacheKey.indicatorTypes(indicator.orgId));
    void logAudit("indicator_type.upserted", "indicator_type", String(indicator.id), { name: indicator.name }, indicator.orgId);
    return rowToIndicatorType(data as DbIndicatorType);
  }
  const { data, error } = await supabase
    .from("indicator_types")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(indicator.orgId));
  void logAudit("indicator_type.upserted", "indicator_type", String((data as DbIndicatorType).id), { name: indicator.name }, indicator.orgId);
  return rowToIndicatorType(data as DbIndicatorType);
}

export async function deleteIndicatorType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("indicator_types")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(orgId));
  void logAudit("indicator_type.archived", "indicator_type", String(id), {}, orgId);
}

export async function restoreIndicatorType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("indicator_types")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(orgId));
  void logAudit("indicator_type.restored", "indicator_type", String(id), {}, orgId);
}
