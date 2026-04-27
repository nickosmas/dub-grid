"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Organization } from "@/types";
import {
  OrganizationSettingsConflictError,
  updateOrganizationSettings,
} from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { useMediaQuery, MOBILE } from "@/hooks";
import { ExplainerSection, PreviewFrame } from "@/components/ui/explainer-section";
import { SectionCard, labelStyle } from "./shared";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";

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
  const buildForm = useCallback(() => ({
    focusAreaLabel: organization.focusAreaLabel,
    certificationLabel: organization.certificationLabel,
    roleLabel: organization.roleLabel,
    departmentLabel: organization.departmentLabel,
  }), [organization]);
  const [form, setForm] = useState(buildForm);
  const [saving, setSaving] = useState(false);

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
    if (!organization.updatedAt) {
      toast.error("Organization data is out of date. Refresh and try again.");
      return;
    }
    setSaving(true);
    try {
      const updated: Organization = {
        ...organization,
        focusAreaLabel: form.focusAreaLabel.trim() || "Focus Areas",
        certificationLabel: form.certificationLabel.trim() || "Certifications",
        roleLabel: form.roleLabel.trim() || "Roles",
        departmentLabel: form.departmentLabel.trim() || "Scheduled Departments",
      };
      const persisted = await updateOrganizationSettings({
        orgId: organization.id,
        expectedUpdatedAt: organization.updatedAt,
        focusAreaLabel: updated.focusAreaLabel,
        certificationLabel: updated.certificationLabel,
        roleLabel: updated.roleLabel,
        departmentLabel: updated.departmentLabel,
      });
      onSave(persisted);
      toast.success("Labels saved");
    } catch (err) {
      if (err instanceof OrganizationSettingsConflictError) {
        onSave(err.latestOrganization);
        setForm({
          focusAreaLabel: err.latestOrganization.focusAreaLabel,
          certificationLabel: err.latestOrganization.certificationLabel,
          roleLabel: err.latestOrganization.roleLabel,
          departmentLabel: err.latestOrganization.departmentLabel,
        });
        toast.error("Labels changed elsewhere. Review the latest values and try again.");
      } else {
        toast.error("Failed to save labels");
        Sentry.captureException(err);
      }
    } finally {
      setSaving(false);
    }
  }, [form, organization, onSave]);

  const handleCancel = useCallback(() => {
    setForm(buildForm());
  }, [buildForm]);

  const previewLabels = {
    focusAreaLabel: form.focusAreaLabel.trim() || "Focus Areas",
    certificationLabel: form.certificationLabel.trim() || "Certifications",
    roleLabel: form.roleLabel.trim() || "Roles",
    departmentLabel: form.departmentLabel.trim() || "Scheduled Departments",
  };
  const explainerPoints = [
    {
      title: "Custom labels rename DubGrid for your organization",
      description: "Use these fields when your team already has its own language, such as wings, units, badges, or positions.",
    },
    {
      title: "Labels change wording, not behavior",
      description: "Renaming a section updates the language people see across the app, but it does not change permissions, scheduling logic, or data relationships. The department label applies to scheduled departments only.",
    },
    {
      title: "Keep labels short and consistent",
      description: "These names appear in navigation, settings, forms, and schedule views, so concise wording works best.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ExplainerSection
        title="How custom labels work"
        defaultOpen
        storageKey="dg-explainer-custom-labels"
        points={explainerPoints}
        preview={(
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <PreviewFrame
              title="Settings and navigation"
              subtitle="The wording people see around the app"
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  previewLabels.departmentLabel,
                  previewLabels.focusAreaLabel,
                  previewLabels.certificationLabel,
                  previewLabels.roleLabel,
                ].map((label) => (
                  <span
                    key={label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 9px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border-light)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </PreviewFrame>

            <PreviewFrame
              title="Across the app"
              subtitle="Example schedule-facing language"
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-sm)",
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border-light)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Schedule view
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    {previewLabels.focusAreaLabel}: Operations
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    {previewLabels.certificationLabel}: Level 2
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    {previewLabels.roleLabel}: Supervisor
                  </div>
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--dg-radius-sm)",
                    background: "var(--color-brand-bg)",
                    border: "1px solid var(--color-brand-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-brand)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    People view
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    {previewLabels.departmentLabel}: Operations
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    Management Departments: Administration
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    Filter by {previewLabels.focusAreaLabel.toLowerCase()}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    Group by {previewLabels.roleLabel.toLowerCase()}
                  </div>
                </div>
              </div>
            </PreviewFrame>
          </div>
        )}
      />

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
              <label style={labelStyle}>SCHEDULED DEPARTMENTS LABEL</label>
              <input
                value={form.departmentLabel}
                onChange={(e) => setForm((p) => ({ ...p, departmentLabel: e.target.value }))}
                placeholder="Scheduled Departments"
                maxLength={30}
                className="dg-input"
                readOnly={readOnly}
              />
              <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
                e.g. Scheduled Departments, Teams, Service Lines
              </p>
            </div>
          </div>

          {!readOnly && <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
            {isModified ? (
              <button
                onClick={handleCancel}
                disabled={saving}
                className="dg-btn dg-btn-secondary"
              >
                {EDITOR_ACTION_LABELS.discard}
              </button>
            ) : null}
            <button
              onClick={handleSave}
              disabled={!isModified || saving}
              className="dg-btn dg-btn-primary"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>}
        </div>
      </SectionCard>
    </div>
  );
}
