"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Organization } from "@/types";
import { toast } from "sonner";
import {
  OrganizationSettingsConflictError,
  updateOrganizationSettings,
} from "@/features/organization/client";
import ConfirmDialog from "@/components/ConfirmDialog";
import CalendarDatePicker from "@/components/ui/calendar-date-picker";

export default function ScheduleRules({
  organization,
  onOrganizationSave,
}: {
  organization: Organization;
  onOrganizationSave: (o: Organization) => void;
}) {
  const [enforceConflictPrevention, setEnforceConflictPrevention] = useState(
    organization.enforceConflictPrevention,
  );
  const [payPeriodStartDate, setPayPeriodStartDate] = useState(
    organization.payPeriodStartDate ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setEnforceConflictPrevention(organization.enforceConflictPrevention);
    setPayPeriodStartDate(organization.payPeriodStartDate ?? "");
  }, [
    organization.enforceConflictPrevention,
    organization.payPeriodStartDate,
    organization.updatedAt,
  ]);

  const isModified =
    enforceConflictPrevention !== organization.enforceConflictPrevention
    || payPeriodStartDate !== (organization.payPeriodStartDate ?? "");

  const handleSave = useCallback(async () => {
    if (!organization.updatedAt) {
      toast.error("Organization data is out of date. Refresh and try again.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateOrganizationSettings({
        orgId: organization.id,
        expectedUpdatedAt: organization.updatedAt,
        enforceConflictPrevention,
        payPeriodStartDate: payPeriodStartDate || null,
      });
      onOrganizationSave(updated);
      toast.success("Schedule rules saved");
    } catch (err) {
      if (err instanceof OrganizationSettingsConflictError) {
        onOrganizationSave(err.latestOrganization);
        setEnforceConflictPrevention(err.latestOrganization.enforceConflictPrevention);
        setPayPeriodStartDate(err.latestOrganization.payPeriodStartDate ?? "");
        toast.error("Schedule rules changed elsewhere. Review the latest values and try again.");
      } else {
        toast.error("Failed to update setting");
      }
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }, [
    enforceConflictPrevention,
    onOrganizationSave,
    organization.id,
    organization.updatedAt,
    payPeriodStartDate,
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: "var(--dg-fs-body)", fontWeight: 600, color: "var(--color-text-primary)" }}>Enforce shift conflict prevention</div>
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 2 }}>When enabled, overlapping shifts cannot be saved. Admins can override.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setEnforceConflictPrevention((current) => !current)}
            aria-label="Enforce shift conflict prevention"
            style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: enforceConflictPrevention ? "var(--color-brand)" : "var(--color-border)",
              position: "relative", transition: "background 0.2s",
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 3,
              left: enforceConflictPrevention ? 23 : 3,
              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
            }} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <label
            htmlFor="pay-period-start-date"
            style={{ fontSize: "var(--dg-fs-body)", fontWeight: 600, color: "var(--color-text-primary)" }}
          >
            Biweekly pay period start date
          </label>
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 2 }}>
            Set one anchor date and DubGrid will align every 2-week schedule view to that repeating pay period. Leave blank to keep 2-week views aligned to calendar weeks.
          </div>
        </div>
        <div style={{ maxWidth: 260 }}>
          <CalendarDatePicker
            id="pay-period-start-date"
            value={payPeriodStartDate}
            onChange={setPayPeriodStartDate}
            label="Biweekly pay period start date"
            allowClear
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!isModified || saving}
          className="dg-btn dg-btn-primary"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title="Save Schedule Rule"
          message="This change updates a workspace-wide scheduling rule. Review carefully before saving."
          confirmLabel="Save Rule"
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
