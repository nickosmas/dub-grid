"use client";

import React, { useState, useCallback, useRef } from "react";
import { Organization } from "@/types";
import { Button } from "@/components/Button";
import { saveOrganizationSettingsWithRecovery } from "@/features/organization/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { useMediaQuery, MOBILE } from "@/hooks";
import { getLineTextError, normalizeLineText } from "@/lib/form-validation";
import { SectionCard, labelStyle } from "./shared";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useNavigationGuard } from "@/components/NavigationGuardProvider";
import { useRegisterWizardEditor, useWizardMode } from "@/components/onboarding/WizardModeContext";
import { ButtonLoading } from "@/components/ButtonSpinner";

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
  const isWizardMode = useWizardMode();
  const buildForm = useCallback(
    () => ({
      focusAreaLabel: organization.focusAreaLabel,
      certificationLabel: organization.certificationLabel,
      roleLabel: organization.roleLabel,
    }),
    [organization],
  );
  const [form, setForm] = useState(buildForm);
  const [saving, setSaving] = useState(false);
  const fieldErrors = {
    focusAreaLabel:
      form.focusAreaLabel.trim().length > 0
        ? getLineTextError(form.focusAreaLabel, {
            label: "Focus area label",
            maxLength: 50,
            required: true,
            disallowUrl: true,
          })
        : null,
    certificationLabel:
      form.certificationLabel.trim().length > 0
        ? getLineTextError(form.certificationLabel, {
            label: "Certification label",
            maxLength: 50,
            required: true,
            disallowUrl: true,
          })
        : null,
    roleLabel:
      form.roleLabel.trim().length > 0
        ? getLineTextError(form.roleLabel, {
            label: "Role label",
            maxLength: 50,
            required: true,
            disallowUrl: true,
          })
        : null,
  } as const;
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  const isModified =
    form.focusAreaLabel !== organization.focusAreaLabel ||
    form.certificationLabel !== organization.certificationLabel ||
    form.roleLabel !== organization.roleLabel;

  // Covers both the sidebar click and the tab close; the provider owns the
  // `beforeunload` this panel used to register for itself.
  useNavigationGuard("organization-labels", { isDirty: () => isModified });

  const lastSaveErrorRef = useRef<unknown>(null);

  const handleSave = useCallback(async () => {
    lastSaveErrorRef.current = null;
    if (hasFieldErrors) {
      lastSaveErrorRef.current = new Error("Validation errors prevent save.");
      return;
    }
    if (!organization.updatedAt) {
      lastSaveErrorRef.current = new Error("Organization data is out of date.");
      toast.error("Organization data is out of date. Refresh and try again.");
      return;
    }
    setSaving(true);
    try {
      const updated: Organization = {
        ...organization,
        focusAreaLabel: form.focusAreaLabel.trim()
          ? normalizeLineText(form.focusAreaLabel, {
              label: "Focus area label",
              maxLength: 50,
              required: true,
              disallowUrl: true,
            })
          : "Focus Areas",
        certificationLabel: form.certificationLabel.trim()
          ? normalizeLineText(form.certificationLabel, {
              label: "Certification label",
              maxLength: 50,
              required: true,
              disallowUrl: true,
            })
          : "Certifications",
        roleLabel: form.roleLabel.trim()
          ? normalizeLineText(form.roleLabel, {
              label: "Role label",
              maxLength: 50,
              required: true,
              disallowUrl: true,
            })
          : "Roles",
      };
      const result = await saveOrganizationSettingsWithRecovery({
        baseline: organization,
        input: {
          orgId: organization.id,
          expectedUpdatedAt: organization.updatedAt,
          focusAreaLabel: updated.focusAreaLabel,
          certificationLabel: updated.certificationLabel,
          roleLabel: updated.roleLabel,
        },
      });
      onSave(result.organization);
      if (result.status === "changed_elsewhere") {
        setForm({
          focusAreaLabel: result.organization.focusAreaLabel,
          certificationLabel: result.organization.certificationLabel,
          roleLabel: result.organization.roleLabel,
        });
        toast.info("Labels were refreshed to the latest saved values.");
        return;
      }
      toast.success("Labels saved");
    } catch (err) {
      lastSaveErrorRef.current = err;
      toast.error("We couldn't save your labels. Try again.");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  }, [form, hasFieldErrors, organization, onSave]);

  const handleCancel = useCallback(() => {
    setForm(buildForm());
  }, [buildForm]);

  useRegisterWizardEditor(
    "organization-labels",
    {
      isDirty: () => isModified,
      hasErrors: () => hasFieldErrors,
      save: async () => {
        await handleSave();
        if (lastSaveErrorRef.current) throw lastSaveErrorRef.current;
      },
    },
    isWizardMode && !readOnly,
  );

  return (
    <SectionCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}
        >
          <div>
            <label style={labelStyle}>FOCUS AREAS LABEL</label>
            <input
              value={form.focusAreaLabel}
              onChange={(e) => setForm((p) => ({ ...p, focusAreaLabel: e.target.value }))}
              placeholder="Focus Areas"
              maxLength={30}
              className="dg-input"
              readOnly={readOnly}
              style={
                fieldErrors.focusAreaLabel ? { borderColor: "var(--dg-color-danger)" } : undefined
              }
            />
            {fieldErrors.focusAreaLabel ? (
              <p
                role="alert"
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--dg-color-danger)",
                  margin: "4px 0 0",
                }}
              >
                {fieldErrors.focusAreaLabel}
              </p>
            ) : null}
            <p
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
                margin: "4px 0 0",
              }}
            >
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
              style={
                fieldErrors.certificationLabel
                  ? { borderColor: "var(--dg-color-danger)" }
                  : undefined
              }
            />
            {fieldErrors.certificationLabel ? (
              <p
                role="alert"
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--dg-color-danger)",
                  margin: "4px 0 0",
                }}
              >
                {fieldErrors.certificationLabel}
              </p>
            ) : null}
            <p
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
                margin: "4px 0 0",
              }}
            >
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
              style={fieldErrors.roleLabel ? { borderColor: "var(--dg-color-danger)" } : undefined}
            />
            {fieldErrors.roleLabel ? (
              <p
                role="alert"
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--dg-color-danger)",
                  margin: "4px 0 0",
                }}
              >
                {fieldErrors.roleLabel}
              </p>
            ) : null}
            <p
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
                margin: "4px 0 0",
              }}
            >
              e.g. Responsibilities, Positions
            </p>
          </div>
        </div>

        {!readOnly && !isWizardMode && (
          <div
            style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}
          >
            {isModified ? (
              <Button onClick={handleCancel} disabled={saving} className="dg-btn dg-btn-secondary">
                {EDITOR_ACTION_LABELS.discard}
              </Button>
            ) : null}
            <Button
              onClick={handleSave}
              disabled={!isModified || saving || hasFieldErrors}
              className="dg-btn dg-btn-primary"
            >
              <ButtonLoading loading={saving}>{EDITOR_ACTION_LABELS.save}</ButtonLoading>
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
