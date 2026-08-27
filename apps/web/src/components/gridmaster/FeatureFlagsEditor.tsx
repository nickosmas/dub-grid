"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  OrganizationSettingsConflictError,
  updateOrganizationSettings,
} from "@/features/organization/client";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import type { Organization } from "@/types";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle } from "@/lib/styles";
import ConfirmDialog from "@/components/ConfirmDialog";

const REALTIME_FLAG = {
  name: "disable_realtime",
  label: "Pause Live Updates",
  description: "Stop live schedule and organization updates for this organization.",
} as const;

const HIGH_IMPACT_FLAGS = new Set<string>([REALTIME_FLAG.name]);

function normalizeFlagState(flags: Record<string, boolean>): Record<string, boolean> {
  return {
    [REALTIME_FLAG.name]: flags[REALTIME_FLAG.name] === true,
  };
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
      toast.success("Runtime controls updated");
      onUpdated?.(updated);
    } catch (err: unknown) {
      if (err instanceof OrganizationSettingsConflictError) {
        const latestFlags = normalizeFlagState(err.latestOrganization.featureOverrides ?? {});
        setFlags(latestFlags);
        setSavedFlags(latestFlags);
        onUpdated?.(err.latestOrganization);
        toast.error("Runtime controls changed elsewhere. Review the latest values and try again.");
      } else {
        toast.error(
          formatClientErrorMessage(err, "We couldn't update the feature controls. Try again."),
        );
      }
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  function toggleFlag(name: string) {
    setFlags((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  const hasHighImpactChanges = useMemo(() => {
    const nextFlags = normalizeFlagState(flags);
    return Object.keys(nextFlags).some(
      (flag) =>
        HIGH_IMPACT_FLAGS.has(flag) && (nextFlags[flag] ?? false) !== (savedFlags[flag] ?? false),
    );
  }, [flags, savedFlags]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Runtime Controls</div>
        <div style={sectionBodyStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}
            >
              <input
                type="checkbox"
                checked={flags[REALTIME_FLAG.name] ?? false}
                onChange={() => toggleFlag(REALTIME_FLAG.name)}
                style={{ width: 16, height: 16, accentColor: "var(--dg-color-today-text)" }}
              />
              <div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    color: "var(--dg-color-text-primary)",
                  }}
                >
                  {REALTIME_FLAG.label}
                </div>
                <div
                  style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-muted)" }}
                >
                  {REALTIME_FLAG.description}
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Save */}
      <EditorActionRow
        secondaryAction={
          hasChanges ? (
            <Button
              className="dg-btn dg-btn-secondary"
              onClick={() => setFlags(savedFlags)}
              disabled={saving}
            >
              {EDITOR_ACTION_LABELS.discard}
            </Button>
          ) : undefined
        }
        primaryAction={
          <Button
            className="dg-btn dg-btn-primary"
            onClick={() => {
              if (hasHighImpactChanges) {
                setConfirmOpen(true);
              } else {
                return handleSave();
              }
            }}
            disabled={saving || !hasChanges}
          >
            <ButtonLoading loading={saving}>{EDITOR_ACTION_LABELS.save}</ButtonLoading>
          </Button>
        }
      />

      {confirmOpen && (
        <ConfirmDialog
          title="Save Runtime Control Changes"
          message="This change can affect live organization behavior. Review carefully before saving."
          confirmLabel="Save Changes"
          variant="warning"
          isLoading={saving}
          onConfirm={() => handleSave()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
