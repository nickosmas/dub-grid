"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Organization } from "@/types";
import {
  OrganizationSettingsConflictError,
  updateOrganizationSettings,
} from "@/features/organization/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { useMediaQuery, MOBILE, useEmployeeCount } from "@/hooks";
import { SectionCard, labelStyle } from "./shared";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import OrganizationLocationFields from "@/components/organization/OrganizationLocationFields";
import OrganizationChangeReviewModal from "@/components/organization/OrganizationChangeReviewModal";
import {
  getOrganizationAddressFields,
  withComposedOrganizationAddress,
} from "@/lib/organization-profile";
import {
  buildOrganizationSettingsChanges,
  pickOrganizationSettings,
} from "@/lib/organization-settings";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import {
  getLineTextError,
  getOptionalUsPhoneFieldError,
  normalizeLineText,
} from "@/lib/form-validation";
import { useRegisterWizardEditor, useWizardMode } from "@/components/onboarding/WizardModeContext";

export default function OrganizationGeneral({
  organization,
  onSave,
}: {
  organization: Organization;
  onSave: (o: Organization) => void;
}) {
  const isWizardMode = useWizardMode();
  const isMobile = useMediaQuery(MOBILE);
  const { employeeCount, loading: employeeCountLoading } = useEmployeeCount(organization.id);
  const buildForm = useCallback(
    (source: Organization = organization) => ({
      name: source.name,
      phone: source.phone,
      timezone: source.timezone ?? "",
      ...getOrganizationAddressFields(source),
    }),
    [organization],
  );
  const [form, setForm] = useState(() => buildForm());
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    setForm(buildForm());
  }, [buildForm, organization.id, organization.updatedAt]);

  const nextOrganization = useMemo<Organization>(
    () => ({
      ...organization,
      name: form.name.trim(),
      phone: form.phone.trim(),
      ...withComposedOrganizationAddress({
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        addressCity: form.addressCity.trim(),
        addressState: form.addressState.trim(),
        addressPostalCode: form.addressPostalCode.trim(),
        addressCountry: form.addressCountry.trim(),
      }),
      timezone: form.timezone || null,
    }),
    [form, organization],
  );

  const changes = useMemo(
    () =>
      buildOrganizationSettingsChanges(
        pickOrganizationSettings(organization),
        pickOrganizationSettings(nextOrganization),
      ),
    [organization, nextOrganization],
  );

  const isModified = changes.length > 0;
  const nameError = getLineTextError(form.name, {
    label: "Organization name",
    maxLength: 60,
    required: true,
  });
  const phoneError = getOptionalUsPhoneFieldError(form.phone);
  const hasValidationErrors = Boolean(nameError || phoneError);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    if (!isModified) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isModified]);

  // Tracks whether the most recent handleSave call completed successfully.
  // Wizard mode reads this after `save()` returns to decide whether to advance.
  const lastSaveErrorRef = useRef<unknown>(null);

  const handleSave = useCallback(async () => {
    lastSaveErrorRef.current = null;
    if (nameError || phoneError) {
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
      const normalizedName = normalizeLineText(form.name, {
        label: "Organization name",
        maxLength: 60,
        required: true,
      });
      const updated = await updateOrganizationSettings({
        orgId: organization.id,
        expectedUpdatedAt: organization.updatedAt,
        name: normalizedName,
        phone: nextOrganization.phone,
        addressLine1: nextOrganization.addressLine1,
        addressLine2: nextOrganization.addressLine2,
        addressCity: nextOrganization.addressCity,
        addressState: nextOrganization.addressState,
        addressPostalCode: nextOrganization.addressPostalCode,
        addressCountry: nextOrganization.addressCountry,
        timezone: nextOrganization.timezone ?? "",
      });
      onSave(updated);
      setReviewOpen(false);
      toast.success("Settings saved");
    } catch (err) {
      lastSaveErrorRef.current = err;
      if (err instanceof OrganizationSettingsConflictError) {
        onSave(err.latestOrganization);
        setForm(buildForm(err.latestOrganization));
        setReviewOpen(false);
        toast.error(
          "Organization details changed elsewhere. Review the latest values and try again.",
        );
        return;
      }
      toast.error("Failed to save settings");
      Sentry.captureException(err);
    } finally {
      setSaving(false);
    }
  }, [
    buildForm,
    form.name,
    nameError,
    nextOrganization,
    onSave,
    organization.id,
    organization.updatedAt,
    phoneError,
  ]);

  const handleReview = useCallback(() => {
    if (!isModified || saving || hasValidationErrors) return;
    setReviewOpen(true);
  }, [hasValidationErrors, isModified, saving]);

  // Wizard mode: expose save() so the wizard's Continue button can save this
  // section without the user clicking Review & Save first. The review modal
  // is bypassed during onboarding — there's no production data to protect yet.
  useRegisterWizardEditor(
    "organization-general",
    {
      isDirty: () => isModified,
      hasErrors: () => hasValidationErrors,
      save: async () => {
        await handleSave();
        if (lastSaveErrorRef.current) throw lastSaveErrorRef.current;
      },
    },
    isWizardMode,
  );

  const handleCancel = useCallback(() => {
    setReviewOpen(false);
    setForm(buildForm());
  }, [buildForm]);

  return (
    <SectionCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}
        >
          <div>
            <label style={labelStyle}>ORGANIZATION NAME</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              maxLength={60}
              className="dg-input"
            />
            {nameError ? (
              <p
                role="alert"
                style={{
                  margin: "6px 0 0",
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--color-danger)",
                }}
              >
                {nameError}
              </p>
            ) : null}
          </div>
        </div>
        <OrganizationLocationFields
          value={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          phoneError={phoneError}
          employeeCount={employeeCount}
          employeeCountLoading={employeeCountLoading}
          gridTemplateColumns={isMobile ? "1fr" : "1fr 1fr"}
        />

        {!isWizardMode && (
          <EditorActionRow
            secondaryAction={
              isModified ? (
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="dg-btn dg-btn-secondary"
                >
                  {EDITOR_ACTION_LABELS.discard}
                </button>
              ) : null
            }
            primaryAction={
              <button
                onClick={handleReview}
                disabled={!isModified || saving || hasValidationErrors}
                className="dg-btn dg-btn-primary"
              >
                Review & Save
              </button>
            }
          />
        )}

        {reviewOpen ? (
          <OrganizationChangeReviewModal
            changes={changes}
            saving={saving}
            onCancel={() => {
              if (!saving) setReviewOpen(false);
            }}
            onConfirm={() => {
              void handleSave();
            }}
          />
        ) : null}
      </div>
    </SectionCard>
  );
}
