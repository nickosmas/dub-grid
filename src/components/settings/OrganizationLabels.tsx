"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Organization } from "@/types";
import { updateOrganization } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { useMediaQuery, MOBILE } from "@/hooks";
import { labelStyle } from "./shared";

export default function OrganizationLabels({
  organization,
  onSave,
  readOnly = false,
}: {
  organization: Organization;
  onSave: (o: Organization) => void;
  readOnly?: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [form, setForm] = useState({
    focusAreaLabel: organization.focusAreaLabel,
    certificationLabel: organization.certificationLabel,
    roleLabel: organization.roleLabel,
    departmentLabel: organization.departmentLabel,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isModified =
    form.focusAreaLabel !== organization.focusAreaLabel ||
    form.certificationLabel !== organization.certificationLabel ||
    form.roleLabel !== organization.roleLabel ||
    form.departmentLabel !== organization.departmentLabel;

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    if (!isModified) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isModified]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated: Organization = {
        ...organization,
        focusAreaLabel: form.focusAreaLabel.trim() || "Focus Areas",
        certificationLabel: form.certificationLabel.trim() || "Certifications",
        roleLabel: form.roleLabel.trim() || "Roles",
        departmentLabel: form.departmentLabel.trim() || "Departments",
      };
      await updateOrganization(updated);
      onSave(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Labels saved");
    } catch (err) {
      toast.error("Failed to save labels");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  }, [form, organization, onSave]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", margin: 0 }}>
        Customize what your organization calls each feature. These labels appear throughout the app.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle}>FOCUS AREAS LABEL</label>
          <input
            value={form.focusAreaLabel}
            onChange={(e) => setForm((p) => ({ ...p, focusAreaLabel: e.target.value }))}
            placeholder="Focus Areas"
            maxLength={30}
            className="dg-input"
            readOnly={readOnly}
          />
          <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            e.g. Focus Areas, Departments, Units
          </p>
        </div>
        <div>
          <label style={labelStyle}>CERTIFICATIONS LABEL</label>
          <input
            value={form.certificationLabel}
            onChange={(e) => setForm((p) => ({ ...p, certificationLabel: e.target.value }))}
            placeholder="Certifications"
            maxLength={30}
            className="dg-input"
            readOnly={readOnly}
          />
          <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            e.g. Certifications, Designations
          </p>
        </div>
        <div>
          <label style={labelStyle}>ROLES LABEL</label>
          <input
            value={form.roleLabel}
            onChange={(e) => setForm((p) => ({ ...p, roleLabel: e.target.value }))}
            placeholder="Roles"
            maxLength={30}
            className="dg-input"
            readOnly={readOnly}
          />
          <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            e.g. Responsibilities, Positions
          </p>
        </div>
        <div>
          <label style={labelStyle}>DEPARTMENTS LABEL</label>
          <input
            value={form.departmentLabel}
            onChange={(e) => setForm((p) => ({ ...p, departmentLabel: e.target.value }))}
            placeholder="Departments"
            maxLength={30}
            className="dg-input"
            readOnly={readOnly}
          />
          <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            e.g. Departments, Teams, Divisions
          </p>
        </div>
      </div>

      {!readOnly && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={!isModified || saving}
          style={{
            background: isModified ? "var(--color-brand)" : "var(--color-border)",
            border: "none",
            color: "var(--color-text-inverse)",
            borderRadius: 8,
            padding: "9px 20px",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 700,
            cursor: isModified ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-brand)", fontWeight: 600 }}>
            Saved!
          </span>
        )}
      </div>}
    </div>
  );
}
