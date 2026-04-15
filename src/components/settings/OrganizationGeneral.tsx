"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Organization } from "@/types";
import { updateOrganization } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import CustomSelect from "@/components/CustomSelect";
import { useMediaQuery, MOBILE } from "@/hooks";
import { labelStyle, TIMEZONES } from "./shared";

export default function OrganizationGeneral({
  organization,
  onSave,
}: {
  organization: Organization;
  onSave: (o: Organization) => void;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [form, setForm] = useState({
    name: organization.name,
    address: organization.address,
    phone: organization.phone,
    employeeCount: organization.employeeCount?.toString() ?? "",
    timezone: organization.timezone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isModified =
    form.name !== organization.name ||
    form.address !== organization.address ||
    form.phone !== organization.phone ||
    (form.employeeCount || "") !== (organization.employeeCount?.toString() ?? "") ||
    form.timezone !== (organization.timezone ?? "");

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    if (!isModified) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isModified]);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const updated: Organization = {
        ...organization,
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        employeeCount: form.employeeCount ? Math.max(0, Math.round(parseInt(form.employeeCount))) || null : null,
        timezone: form.timezone || null,
      };
      await updateOrganization(updated);
      onSave(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Failed to save settings");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  }, [form, organization, onSave]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle}>ORGANIZATION NAME</label>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            maxLength={60}
            className="dg-input"
          />
        </div>
        <div>
          <label style={labelStyle}>PHONE</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="(415) 555-0100"
            maxLength={20}
            className="dg-input"
          />
        </div>
        <div>
          <label style={labelStyle}>ADDRESS</label>
          <input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="123 Main St, City, State ZIP"
            maxLength={120}
            className="dg-input"
          />
        </div>
        <div>
          <label style={labelStyle}>NUMBER OF EMPLOYEES</label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.employeeCount}
            onChange={(e) => {
              const v = e.target.value;
              // Allow empty, otherwise clamp to non-negative integer
              if (v === "") setForm((p) => ({ ...p, employeeCount: "" }));
              else {
                const n = Math.max(0, Math.round(Number(v)));
                setForm((p) => ({ ...p, employeeCount: isNaN(n) ? "" : String(n) }));
              }
            }}
            placeholder="e.g. 28"
            className="dg-input"
          />
        </div>
      </div>

      {/* Timezone */}
      <div>
        <label style={labelStyle}>TIME ZONE</label>
        <CustomSelect
          value={form.timezone}
          options={[
            { value: "", label: "— Select a time zone —" },
            ...TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label })),
          ]}
          onChange={(v) => setForm((p) => ({ ...p, timezone: v }))}
          style={{ width: "100%", maxWidth: 340 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
        {saved && (
          <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-success)", fontWeight: 600 }}>
            Saved!
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={!isModified || saving}
          className="dg-btn dg-btn-primary"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
