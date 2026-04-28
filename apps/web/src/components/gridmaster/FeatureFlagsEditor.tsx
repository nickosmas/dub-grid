"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  OrganizationSettingsConflictError,
  updateOrganizationSettings,
} from "@/features/organization/client";
import { getEditorSaveLabel, EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import type { Organization } from "@/types";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle } from "@/lib/styles";
import ConfirmDialog from "@/components/ConfirmDialog";

const KNOWN_FLAGS: { name: string; label: string; description: string }[] = [
  { name: "beta_shift_requests", label: "Shift Requests (Beta)", description: "Enable shift pickup and swap request workflow" },
  { name: "beta_coverage_panel", label: "Coverage Panel (Beta)", description: "Show coverage requirements panel in schedule view" },
  { name: "beta_recurring_shifts", label: "Recurring Shifts (Beta)", description: "Enable recurring shift template management" },
  { name: "beta_dashboard_analytics", label: "Dashboard Analytics (Beta)", description: "Show expanded analytics in the dashboard" },
  { name: "maintenance_mode", label: "Maintenance Mode", description: "Put org in read-only mode (data migration, incident response)" },
  { name: "disable_realtime", label: "Disable Realtime", description: "Turn off Supabase Realtime subscriptions for this org" },
];

const HIGH_IMPACT_FLAGS = new Set(["maintenance_mode", "disable_realtime"]);

function normalizeFlagState(flags: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(
    Object.keys(flags)
      .sort()
      .map((name) => [name, !!flags[name]]),
  );
}

function serializeFlagState(flags: Record<string, boolean>): string {
  return JSON.stringify(normalizeFlagState(flags));
}

export default function FeatureFlagsEditor({
  organization,
  onUpdated,
}: {
  organization: Organization;
  onUpdated?: (updated: Organization) => void;
}) {
  const propFlags = useMemo(
    () => normalizeFlagState(organization.featureOverrides ?? {}),
    [organization.featureOverrides],
  );
  const [flags, setFlags] = useState<Record<string, boolean>>(propFlags);
  const [savedFlags, setSavedFlags] = useState<Record<string, boolean>>(propFlags);
  const [saving, setSaving] = useState(false);
  const [newFlagName, setNewFlagName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasChanges = serializeFlagState(flags) !== serializeFlagState(savedFlags);

  useEffect(() => {
    setFlags(propFlags);
    setSavedFlags(propFlags);
  }, [organization.id, propFlags]);

  async function handleSave() {
    if (!organization.updatedAt) {
      toast.error("Organization data is out of date. Refresh and try again.");
      return;
    }
    setSaving(true);
    try {
      const nextFlags = normalizeFlagState(flags);
      const updated = await updateOrganizationSettings({
        orgId: organization.id,
        expectedUpdatedAt: organization.updatedAt,
        featureOverrides: nextFlags,
      });
      setFlags(nextFlags);
      setSavedFlags(nextFlags);
      toast.success("Feature flags updated");
      onUpdated?.(updated);
    } catch (err: unknown) {
      if (err instanceof OrganizationSettingsConflictError) {
        const latestFlags = normalizeFlagState(err.latestOrganization.featureOverrides ?? {});
        setFlags(latestFlags);
        setSavedFlags(latestFlags);
        onUpdated?.(err.latestOrganization);
        toast.error("Feature flags changed elsewhere. Review the latest values and try again.");
      } else {
        toast.error((err instanceof Error ? err.message : null) ?? "Failed to update flags");
      }
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  function toggleFlag(name: string) {
    setFlags((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function addCustomFlag() {
    const name = newFlagName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!name) return;
    if (flags[name] !== undefined) { toast.error("Flag already exists"); return; }
    setFlags((prev) => ({ ...prev, [name]: false }));
    setNewFlagName("");
  }

  function removeFlag(name: string) {
    setFlags((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  // All flags: known + any custom ones from the current overrides
  const customFlags = Object.keys(flags).filter((k) => !KNOWN_FLAGS.find((f) => f.name === k));
  const hasHighImpactChanges = useMemo(() => {
    const nextFlags = normalizeFlagState(flags);
    return Object.keys(nextFlags).some((flag) =>
      HIGH_IMPACT_FLAGS.has(flag) && (nextFlags[flag] ?? false) !== (savedFlags[flag] ?? false),
    );
  }, [flags, savedFlags]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Known flags */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Feature Flags</div>
        <div style={sectionBodyStyle}>
          {KNOWN_FLAGS.map((flag) => (
            <div key={flag.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--color-border-light)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <input
                  type="checkbox"
                  checked={flags[flag.name] ?? false}
                  onChange={() => toggleFlag(flag.name)}
                  style={{ width: 16, height: 16, accentColor: "var(--color-today-text)" }}
                />
                <div>
                  <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>{flag.label}</div>
                  <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>{flag.description}</div>
                </div>
              </label>
              <span style={{ fontSize: "var(--dg-fs-footnote)", fontFamily: "var(--font-dm-mono), monospace", color: "var(--color-text-subtle)", flexShrink: 0 }}>
                {flag.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom flags */}
      {customFlags.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Custom Overrides</div>
          <div style={sectionBodyStyle}>
            {customFlags.map((name) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--color-border-light)" }}>
                <input
                  type="checkbox"
                  checked={flags[name] ?? false}
                  onChange={() => toggleFlag(name)}
                  style={{ width: 16, height: 16, accentColor: "var(--color-today-text)" }}
                />
                <span style={{ fontSize: "var(--dg-fs-label)", fontFamily: "var(--font-dm-mono), monospace", color: "var(--color-text-primary)", flex: 1 }}>
                  {name}
                </span>
                <button
                  className="dg-btn dg-btn-ghost"
                  style={{ fontSize: "var(--dg-fs-footnote)", padding: "2px 6px", color: "var(--color-danger)" }}
                  onClick={() => removeFlag(name)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add custom flag */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="dg-input"
          value={newFlagName}
          onChange={(e) => setNewFlagName(e.target.value)}
          placeholder="custom_flag_name"
          style={{ maxWidth: 240, fontSize: "var(--dg-fs-caption)", fontFamily: "var(--font-dm-mono), monospace" }}
          onKeyDown={(e) => { if (e.key === "Enter") addCustomFlag(); }}
        />
        <button className="dg-btn dg-btn-secondary" style={{ fontSize: "var(--dg-fs-caption)" }} onClick={addCustomFlag}>
          + Add Flag
        </button>
      </div>

      {/* Save */}
      <EditorActionRow
        secondaryAction={(
          hasChanges ? (
            <button className="dg-btn dg-btn-secondary" onClick={() => setFlags(savedFlags)} disabled={saving}>
              {EDITOR_ACTION_LABELS.discard}
            </button>
          ) : undefined
        )}
        primaryAction={(
          <button
            className="dg-btn dg-btn-primary"
            onClick={() => {
              if (hasHighImpactChanges) {
                setConfirmOpen(true);
              } else {
                void handleSave();
              }
            }}
            disabled={saving || !hasChanges}
          >
            {getEditorSaveLabel(saving)}
          </button>
        )}
      />

      {confirmOpen && (
        <ConfirmDialog
          title="Save Feature Flag Changes"
          message="This change updates high-impact organization flags. Review carefully before saving because these flags can affect workspace-wide behavior."
          confirmLabel="Save Changes"
          variant="warning"
          isLoading={saving}
          onConfirm={() => {
            void handleSave();
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
