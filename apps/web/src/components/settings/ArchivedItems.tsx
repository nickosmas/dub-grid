"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  fetchAbsenceTypes,
  fetchCertifications,
  fetchDepartments,
  fetchFocusAreas,
  fetchIndicatorTypes,
  fetchJobDefinitions,
  fetchOrganizationRoles,
  fetchShiftCategories,
  restoreAbsenceType,
  restoreCertification,
  restoreDepartment,
  restoreFocusArea,
  restoreIndicatorType,
  restoreJobDefinition,
  restoreOrganizationRole,
  restoreShiftCategory,
} from "@/features/settings/client";
import type { NamedItem, FocusArea, JobDefinition, ShiftCategory, Department, AbsenceType, IndicatorType } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatClientErrorMessage } from "@/lib/client-facing";

interface ArchivedGroup {
  label: string;
  items: { id: number; name: string; archivedAt: string }[];
  restore: (id: number) => Promise<void>;
}

export default function ArchivedItems({ orgId }: { orgId: string }) {
  const [groups, setGroups] = useState<ArchivedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<{
    group: ArchivedGroup;
    itemId: number;
    itemName: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roles, certs, depts, focusAreas, shiftCats, jobs, absenceTypes, indicatorTypes] = await Promise.all([
        fetchOrganizationRoles(orgId, true),
        fetchCertifications(orgId, true),
        fetchDepartments(orgId, true),
        fetchFocusAreas(orgId, true),
        fetchShiftCategories(orgId, true),
        fetchJobDefinitions(orgId, true),
        fetchAbsenceTypes(orgId, true),
        fetchIndicatorTypes(orgId, true),
      ]);

      const toArchived = (items: (NamedItem | FocusArea | JobDefinition | ShiftCategory | Department | AbsenceType | IndicatorType)[]) =>
        items
          .filter((i) => "archivedAt" in i && i.archivedAt)
          .map((i) => ({
            id: i.id as number,
            name: "label" in i ? (i as AbsenceType).label : (i as NamedItem).name,
            archivedAt: (i as { archivedAt: string }).archivedAt,
          }))
          .sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());

      const result: ArchivedGroup[] = [
        { label: "Roles", items: toArchived(roles), restore: (id: number) => restoreOrganizationRole(id, orgId) },
        { label: "Certifications", items: toArchived(certs), restore: (id: number) => restoreCertification(id, orgId) },
        { label: "Departments", items: toArchived(depts), restore: (id: number) => restoreDepartment(id, orgId) },
        { label: "Focus Areas", items: toArchived(focusAreas), restore: (id: number) => restoreFocusArea(id, orgId) },
        { label: "Shifts", items: toArchived(shiftCats), restore: (id: number) => restoreShiftCategory(id, orgId) },
        { label: "Jobs", items: toArchived(jobs), restore: (id: number) => restoreJobDefinition(id, orgId) },
        { label: "Absence Types", items: toArchived(absenceTypes), restore: (id: number) => restoreAbsenceType(id, orgId) },
        { label: "Indicator Types", items: toArchived(indicatorTypes), restore: (id: number) => restoreIndicatorType(id, orgId) },
      ].filter((g) => g.items.length > 0);

      setGroups(result);
    } catch {
      toast.error("Failed to load archived items");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleRestore(group: ArchivedGroup, itemId: number, itemName: string) {
    const key = `${group.label}:${itemId}`;
    setRestoring(key);
    try {
      await group.restore(itemId);
      toast.success(`Restored "${itemName}"`);
      await load();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't restore that item."));
    } finally {
      setRestoring(null);
    }
  }

  if (loading) {
    return <div style={{ padding: 20, fontSize: "var(--dg-fs-label)", color: "var(--color-text-faint)" }}>Loading archived items...</div>;
  }

  if (groups.length === 0) {
    return <EmptyState size="compact" title="No archived items" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((group) => (
        <div key={group.label} style={{ borderRadius: "var(--dg-radius-md)", border: "1px solid var(--color-border)", overflow: "hidden", background: "var(--color-bg-card, white)" }}>
          <div style={{ padding: "10px 16px", background: "var(--color-bg-secondary, #F8F9FA)", borderBottom: "1px solid var(--color-border-light)" }}>
            <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-secondary)" }}>
              {group.label}
            </span>
            <span style={{ marginLeft: 8, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
              {group.items.length} archived
            </span>
          </div>
          {group.items.map((item) => {
            const key = `${group.label}:${item.id}`;
            return (
              <div
                key={item.id}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: "1px solid var(--color-border-light)", fontSize: "var(--dg-fs-label)" }}
              >
                <span style={{ flex: 1, fontWeight: 500, color: "var(--color-text-secondary)" }}>{item.name}</span>
                <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)" }}>
                  {new Date(item.archivedAt).toLocaleDateString()}
                </span>
                <button
                  className="dg-btn dg-btn-ghost"
                  onClick={() => setRestoreConfirm({ group, itemId: item.id, itemName: item.name })}
                  disabled={restoring === key}
                  style={{ fontSize: "var(--dg-fs-caption)", padding: "4px 10px", color: "var(--color-brand)" }}
                >
                  {restoring === key ? "Restoring..." : "Restore"}
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {restoreConfirm && (
        <ConfirmDialog
          title="Restore Archived Item"
          message={`Restore "${restoreConfirm.itemName}"? This can affect downstream scheduling and reporting if the item is referenced elsewhere.`}
          confirmLabel="Restore"
          variant="warning"
          isLoading={restoring === `${restoreConfirm.group.label}:${restoreConfirm.itemId}`}
          onConfirm={() => {
            void handleRestore(
              restoreConfirm.group,
              restoreConfirm.itemId,
              restoreConfirm.itemName,
            );
            setRestoreConfirm(null);
          }}
          onCancel={() => setRestoreConfirm(null)}
        />
      )}
    </div>
  );
}
