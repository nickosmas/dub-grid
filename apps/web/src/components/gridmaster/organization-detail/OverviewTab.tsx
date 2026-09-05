import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import { Button } from "@/components/Button";
import OrganizationChangeReviewModal from "@/components/organization/OrganizationChangeReviewModal";
import OrganizationLocationFields from "@/components/organization/OrganizationLocationFields";
import { InfoRow, MiniStat } from "@/components/gridmaster/organization-detail/shared";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import {
  archiveGridmasterOrganization,
  restoreGridmasterOrganization,
  suspendGridmasterOrganization,
  unsuspendGridmasterOrganization,
  type TenantStats,
} from "@/features/gridmaster/client";
import { saveOrganizationSettingsWithRecovery } from "@/features/organization/client";
import { useEmployeeCount } from "@/hooks";
import { formatClientErrorMessage } from "@/lib/client-facing";
import {
  getOrganizationAddressFields,
  withComposedOrganizationAddress,
} from "@/lib/organization-profile";
import {
  buildOrganizationSettingsChanges,
  pickOrganizationSettings,
} from "@/lib/organization-settings";
import { labelStyle, sectionBodyStyle, sectionHeaderStyle, sectionStyle } from "@/lib/styles";
import { formatTimezoneLabel } from "@/lib/timezones";
import { type Employee, type Organization } from "@/types";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";

// Overview tab for the gridmaster OrganizationDetail view.

export function OverviewTab({
  organization,
  stats,
  onOrgUpdated,
}: {
  organization: Organization;
  stats: TenantStats | undefined;
  onOrgUpdated?: (updated: Organization) => void;
}) {
  const { employeeCount, loading: employeeCountLoading } = useEmployeeCount(organization.id);
  const initialAddress = getOrganizationAddressFields(organization);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(organization.name);
  const [editPhone, setEditPhone] = useState(organization.phone);
  const [editTimezone, setEditTimezone] = useState(organization.timezone ?? "");
  const [editAddressLine1, setEditAddressLine1] = useState(initialAddress.addressLine1);
  const [editAddressLine2, setEditAddressLine2] = useState(initialAddress.addressLine2);
  const [editAddressCity, setEditAddressCity] = useState(initialAddress.addressCity);
  const [editAddressState, setEditAddressState] = useState(initialAddress.addressState);
  const [editAddressPostalCode, setEditAddressPostalCode] = useState(
    initialAddress.addressPostalCode,
  );
  const [editAddressCountry, setEditAddressCountry] = useState(initialAddress.addressCountry);
  const [editFocusAreaLabel, setEditFocusAreaLabel] = useState(organization.focusAreaLabel);
  const [editCertLabel, setEditCertLabel] = useState(organization.certificationLabel);
  const [editRoleLabel, setEditRoleLabel] = useState(organization.roleLabel);
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editShiftDisplayMode, setEditShiftDisplayMode] = useState(organization.shiftDisplayMode);
  const [editEnforceConflictPrevention, setEditEnforceConflictPrevention] = useState(
    organization.enforceConflictPrevention,
  );
  const [editDataRetentionDays, setEditDataRetentionDays] = useState(
    organization.dataRetentionDays ?? 365,
  );
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [suspendConfirm, setSuspendConfirm] = useState(false);
  const [unsuspendConfirm, setUnsuspendConfirm] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const nextOrganization = useMemo<Organization>(() => {
    const updated: Organization = {
      ...organization,
      name: editName.trim(),
      phone: editPhone.trim(),
      ...withComposedOrganizationAddress({
        addressLine1: editAddressLine1.trim(),
        addressLine2: editAddressLine2.trim(),
        addressCity: editAddressCity.trim(),
        addressState: editAddressState.trim(),
        addressPostalCode: editAddressPostalCode.trim(),
        addressCountry: editAddressCountry.trim(),
      }),
      timezone: editTimezone || null,
      focusAreaLabel: editFocusAreaLabel.trim() || "Focus Areas",
      certificationLabel: editCertLabel.trim() || "Certifications",
      roleLabel: editRoleLabel.trim() || "Roles",
      shiftDisplayMode: editShiftDisplayMode,
      enforceConflictPrevention: editEnforceConflictPrevention,
      dataRetentionDays: editDataRetentionDays,
    };
    return updated;
  }, [
    editAddressCity,
    editAddressCountry,
    editAddressLine1,
    editAddressLine2,
    editAddressPostalCode,
    editAddressState,
    editCertLabel,
    editDataRetentionDays,
    editEnforceConflictPrevention,
    editFocusAreaLabel,
    editName,
    editPhone,
    editRoleLabel,
    editShiftDisplayMode,
    editTimezone,
    organization,
  ]);

  const reviewChanges = useMemo(
    () =>
      buildOrganizationSettingsChanges(
        pickOrganizationSettings(organization),
        pickOrganizationSettings(nextOrganization),
      ),
    [nextOrganization, organization],
  );

  const hasChanges = reviewChanges.length > 0;

  function resetEditState() {
    setEditName(organization.name);
    setEditPhone(organization.phone);
    setEditTimezone(organization.timezone ?? "");
    setEditAddressLine1(initialAddress.addressLine1);
    setEditAddressLine2(initialAddress.addressLine2);
    setEditAddressCity(initialAddress.addressCity);
    setEditAddressState(initialAddress.addressState);
    setEditAddressPostalCode(initialAddress.addressPostalCode);
    setEditAddressCountry(initialAddress.addressCountry);
    setEditFocusAreaLabel(organization.focusAreaLabel);
    setEditCertLabel(organization.certificationLabel);
    setEditRoleLabel(organization.roleLabel);
    setEditShiftDisplayMode(organization.shiftDisplayMode);
    setEditEnforceConflictPrevention(organization.enforceConflictPrevention);
    setEditDataRetentionDays(organization.dataRetentionDays ?? 365);
    setReviewOpen(false);
  }

  // Reset edit state when switching to a different organization
  useEffect(() => {
    setEditing(false);
    resetEditState();
  }, [organization.id, organization.updatedAt]);

  async function handleSave() {
    if (!nextOrganization.name) return;
    if (!organization.updatedAt) {
      toast.error("Organization data is out of date. Refresh and try again.");
      return;
    }

    setSaving(true);
    try {
      const result = await saveOrganizationSettingsWithRecovery({
        baseline: organization,
        input: {
          orgId: organization.id,
          expectedUpdatedAt: organization.updatedAt,
          name: nextOrganization.name,
          phone: nextOrganization.phone,
          addressLine1: nextOrganization.addressLine1,
          addressLine2: nextOrganization.addressLine2,
          addressCity: nextOrganization.addressCity,
          addressState: nextOrganization.addressState,
          addressPostalCode: nextOrganization.addressPostalCode,
          addressCountry: nextOrganization.addressCountry,
          timezone: nextOrganization.timezone ?? "",
          focusAreaLabel: nextOrganization.focusAreaLabel,
          certificationLabel: nextOrganization.certificationLabel,
          roleLabel: nextOrganization.roleLabel,
          shiftDisplayMode: nextOrganization.shiftDisplayMode,
          enforceConflictPrevention: nextOrganization.enforceConflictPrevention,
          dataRetentionDays: nextOrganization.dataRetentionDays,
        },
      });
      if (result.status === "saved") {
        toast.success("Organization updated");
      } else {
        toast.info("Organization details were refreshed to the latest saved values.");
      }
      setReviewOpen(false);
      setEditing(false);
      onOrgUpdated?.(result.organization);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't update. Try again."));
    } finally {
      setSaving(false);
    }
  }

  function handleReview() {
    if (!hasChanges || saving) return;
    setReviewOpen(true);
  }

  function handleCancelEditing() {
    resetEditState();
    setEditing(false);
  }

  function handleDiscardEditing() {
    resetEditState();
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      if (organization.archivedAt) {
        await restoreGridmasterOrganization(organization.id);
        toast.success("Organization restored");
        onOrgUpdated?.({ ...organization, archivedAt: null });
      } else {
        // Cancel Stripe subscription before archiving (best-effort)
        if (organization.stripeCustomerId) {
          try {
            await fetch("/api/gridmaster/subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orgId: organization.id, action: "cancel" }),
            });
          } catch {
            // Best-effort — proceed with archive even if Stripe cancel fails
          }
        }
        await archiveGridmasterOrganization(organization.id);
        toast.success("Organization archived");
        onOrgUpdated?.({ ...organization, archivedAt: new Date().toISOString() });
      }
      setArchiveConfirm(false);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "Operation failed"));
    } finally {
      setArchiving(false);
    }
  }

  async function handleUnsuspend() {
    setSuspending(true);
    try {
      await unsuspendGridmasterOrganization(organization.id);
      toast.success("Organization unsuspended");
      onOrgUpdated?.({ ...organization, suspendedAt: null, suspendedReason: null });
      setUnsuspendConfirm(false);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't unsuspend. Try again."));
    } finally {
      setSuspending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MiniStat label="Org users" value={stats?.userCount ?? 0} />
        <MiniStat label="Employees" value={employeeCount} />
      </div>

      {/* Organization info */}
      <div style={sectionStyle}>
        <div
          style={{
            ...sectionHeaderStyle,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Organization Details</span>
          {!editing && (
            <Button
              className="dg-btn dg-btn-ghost"
              style={{ fontSize: "var(--dg-fs-caption)" }}
              onClick={() => {
                resetEditState();
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
        </div>
        <div style={sectionBodyStyle}>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  className="dg-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <OrganizationLocationFields
                value={{
                  phone: editPhone,
                  timezone: editTimezone,
                  addressLine1: editAddressLine1,
                  addressLine2: editAddressLine2,
                  addressCity: editAddressCity,
                  addressState: editAddressState,
                  addressPostalCode: editAddressPostalCode,
                  addressCountry: editAddressCountry,
                }}
                onChange={(patch) => {
                  if (patch.phone !== undefined) setEditPhone(patch.phone);
                  if (patch.timezone !== undefined) setEditTimezone(patch.timezone);
                  if (patch.addressLine1 !== undefined) setEditAddressLine1(patch.addressLine1);
                  if (patch.addressLine2 !== undefined) setEditAddressLine2(patch.addressLine2);
                  if (patch.addressCity !== undefined) setEditAddressCity(patch.addressCity);
                  if (patch.addressState !== undefined) setEditAddressState(patch.addressState);
                  if (patch.addressPostalCode !== undefined)
                    setEditAddressPostalCode(patch.addressPostalCode);
                  if (patch.addressCountry !== undefined)
                    setEditAddressCountry(patch.addressCountry);
                }}
                employeeCount={employeeCount}
                employeeCountLoading={employeeCountLoading}
                gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                }}
              >
                <div>
                  <label style={labelStyle}>Shift display</label>
                  <CustomSelect
                    value={editShiftDisplayMode}
                    options={[
                      { value: "code", label: "Short Labels" },
                      { value: "name", label: "Full Names" },
                    ]}
                    onChange={(val) => setEditShiftDisplayMode(val as "code" | "name")}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
                  <input
                    type="checkbox"
                    id="editConflictPrevention"
                    checked={editEnforceConflictPrevention}
                    onChange={(e) => setEditEnforceConflictPrevention(e.target.checked)}
                  />
                  <label
                    htmlFor="editConflictPrevention"
                    style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}
                  >
                    Conflict Prevention
                  </label>
                </div>
                <div>
                  <label style={labelStyle}>Data retention (days)</label>
                  <input
                    className="dg-input"
                    type="number"
                    min={1}
                    value={editDataRetentionDays}
                    onChange={(e) => setEditDataRetentionDays(Number(e.target.value))}
                  />
                </div>
              </div>
              <EditorActionRow
                style={{ gridColumn: "1 / -1", marginTop: 8 }}
                secondaryAction={
                  <Button
                    className="dg-btn dg-btn-secondary"
                    onClick={hasChanges ? handleDiscardEditing : handleCancelEditing}
                    disabled={saving}
                  >
                    {getEditorDismissLabel({ hasUnsavedChanges: hasChanges })}
                  </Button>
                }
                primaryAction={
                  <Button
                    className="dg-btn dg-btn-primary"
                    onClick={handleReview}
                    disabled={saving || !hasChanges}
                  >
                    Review &amp; Save
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <InfoRow label="Name" value={organization.name} />
              <InfoRow label="Slug" value={organization.slug} />
              <InfoRow label="Address" value={organization.address} />
              <InfoRow label="Phone" value={organization.phone} />
              <InfoRow
                label="Timezone"
                value={
                  organization.timezone
                    ? `${formatTimezoneLabel(organization.timezone)} · ${organization.timezone}`
                    : null
                }
              />
              <InfoRow
                label="Employee count"
                value={
                  employeeCountLoading ? (
                    <span
                      aria-hidden
                      className="dg-skeleton"
                      style={{ display: "inline-block", width: 36, height: 12, borderRadius: 4 }}
                    />
                  ) : (
                    employeeCount.toString()
                  )
                }
              />
            </>
          )}
        </div>
      </div>

      {/* Custom labels */}
      <div style={sectionStyle}>
        <div
          style={{
            ...sectionHeaderStyle,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Custom Labels</span>
          {editing && (
            <span
              style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-subtle)" }}
            >
              Editing above
            </span>
          )}
        </div>
        <div style={sectionBodyStyle}>
          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Focus areas</label>
                <input
                  className="dg-input"
                  value={editFocusAreaLabel}
                  onChange={(e) => setEditFocusAreaLabel(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Certifications</label>
                <input
                  className="dg-input"
                  value={editCertLabel}
                  onChange={(e) => setEditCertLabel(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Roles</label>
                <input
                  className="dg-input"
                  value={editRoleLabel}
                  onChange={(e) => setEditRoleLabel(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <>
              <InfoRow label="Focus areas" value={organization.focusAreaLabel} />
              <InfoRow label="Certifications" value={organization.certificationLabel} />
              <InfoRow label="Roles" value={organization.roleLabel} />
            </>
          )}
        </div>
      </div>

      {/* Billing & Subscription */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Billing &amp; Subscription</div>
        <div style={sectionBodyStyle}>
          <InfoRow label="Status" value={organization.subscriptionStatus ?? "No subscription"} />
          <InfoRow
            label="Trial Ends"
            value={
              organization.trialEndsAt
                ? new Date(organization.trialEndsAt).toLocaleDateString()
                : organization.subscriptionStatus === "trialing" || !organization.subscriptionStatus
                  ? "Not started"
                  : "—"
            }
          />
          <InfoRow
            label="Stripe Customer"
            value={
              organization.stripeCustomerId ? (
                <a
                  href={`https://dashboard.stripe.com/customers/${organization.stripeCustomerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--dg-color-today-text)", textDecoration: "underline" }}
                >
                  {organization.stripeCustomerId}
                </a>
              ) : (
                "Not connected"
              )
            }
          />
        </div>
      </div>

      {/* Danger zone: Archive / Restore */}
      <div
        style={{
          ...sectionStyle,
          borderColor: organization.archivedAt
            ? "var(--dg-color-warning)"
            : "var(--dg-color-danger)",
        }}
      >
        <div
          style={{
            ...sectionHeaderStyle,
            borderBottomColor: organization.archivedAt
              ? "var(--dg-color-warning)"
              : "var(--dg-color-danger)",
            color: organization.archivedAt ? "var(--dg-color-warning)" : "var(--dg-color-danger)",
          }}
        >
          Danger Zone
        </div>
        <div
          style={{
            ...sectionBodyStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
                marginBottom: 4,
              }}
            >
              {organization.archivedAt ? "Restore this organization" : "Archive this organization"}
            </div>
            <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
              {organization.archivedAt
                ? "Restoring will make this organization active again."
                : "Archiving hides the organization from active listings. Data is preserved."}
            </div>
          </div>
          <Button
            className={organization.archivedAt ? "dg-btn dg-btn-primary" : "dg-btn dg-btn-danger"}
            onClick={() => setArchiveConfirm(true)}
            style={{ flexShrink: 0 }}
          >
            {organization.archivedAt ? "Restore" : "Archive"}
          </Button>
        </div>
      </div>

      {archiveConfirm && (
        <ConfirmDialog
          title={organization.archivedAt ? "Restore Organization" : "Archive Organization"}
          message={
            organization.archivedAt
              ? `Are you sure you want to restore "${organization.name}"?`
              : `Are you sure you want to archive "${organization.name}"? The organization will be hidden from active listings but all data will be preserved.`
          }
          confirmLabel={organization.archivedAt ? "Restore" : "Archive"}
          variant={organization.archivedAt ? "info" : "danger"}
          isLoading={archiving}
          onConfirm={handleArchive}
          onCancel={() => setArchiveConfirm(false)}
        />
      )}

      {/* Suspension */}
      <div
        style={{
          ...sectionStyle,
          borderColor: organization.suspendedAt
            ? "var(--dg-color-warning)"
            : "var(--dg-color-border)",
        }}
      >
        <div
          style={{
            ...sectionHeaderStyle,
            borderBottomColor: organization.suspendedAt ? "var(--dg-color-warning)" : undefined,
            color: organization.suspendedAt ? "var(--dg-color-warning)" : undefined,
          }}
        >
          Suspension
        </div>
        <div
          style={{
            ...sectionBodyStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {organization.suspendedAt ? (
            <>
              <div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    color: "var(--dg-color-warning)",
                    marginBottom: 4,
                  }}
                >
                  Organization is suspended
                </div>
                {organization.suspendedReason && (
                  <div
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      color: "var(--dg-color-text-muted)",
                    }}
                  >
                    Reason: {organization.suspendedReason}
                  </div>
                )}
              </div>
              <Button
                className="dg-btn dg-btn-primary"
                onClick={() => setUnsuspendConfirm(true)}
                disabled={suspending}
                style={{ flexShrink: 0 }}
              >
                <ButtonLoading loading={suspending}>Unsuspend</ButtonLoading>
              </Button>
            </>
          ) : (
            <>
              <div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 600,
                    color: "var(--dg-color-text-primary)",
                    marginBottom: 4,
                  }}
                >
                  Suspend this organization
                </div>
                <div
                  style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}
                >
                  Suspending blocks all members from accessing the app. Data is preserved.
                </div>
              </div>
              <Button
                className="dg-btn dg-btn-danger"
                onClick={() => setSuspendConfirm(true)}
                style={{ flexShrink: 0 }}
              >
                Suspend
              </Button>
            </>
          )}
        </div>
      </div>

      {suspendConfirm && (
        <ConfirmDialog
          title="Suspend Organization"
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span>
                Are you sure you want to suspend &quot;{organization.name}&quot;? All members will
                be blocked from accessing the app.
              </span>
              <textarea
                className="dg-input"
                placeholder="Reason for suspension (required)"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                style={{ resize: "vertical" }}
              />
            </div>
          }
          confirmLabel="Suspend"
          variant="danger"
          isLoading={suspending}
          onConfirm={async () => {
            if (!suspendReason.trim()) {
              toast.error("Add a reason for the suspension");
              return;
            }
            setSuspending(true);
            try {
              await suspendGridmasterOrganization(organization.id, suspendReason.trim());
              toast.success("Organization suspended");
              onOrgUpdated?.({
                ...organization,
                suspendedAt: new Date().toISOString(),
                suspendedReason: suspendReason.trim(),
              });
              setSuspendConfirm(false);
              setSuspendReason("");
            } catch (err: unknown) {
              toast.error(formatClientErrorMessage(err, "We couldn't suspend. Try again."));
            } finally {
              setSuspending(false);
            }
          }}
          onCancel={() => {
            setSuspendConfirm(false);
            setSuspendReason("");
          }}
        />
      )}

      {unsuspendConfirm && (
        <ConfirmDialog
          title="Unsuspend Organization"
          message={`Unsuspend "${organization.name}"? Members will regain access to the app.`}
          confirmLabel="Unsuspend"
          variant="warning"
          isLoading={suspending}
          onConfirm={handleUnsuspend}
          onCancel={() => setUnsuspendConfirm(false)}
        />
      )}

      {reviewOpen ? (
        <OrganizationChangeReviewModal
          changes={reviewChanges}
          saving={saving}
          onCancel={() => {
            if (!saving) setReviewOpen(false);
          }}
          onConfirm={() => handleSave()}
        />
      ) : null}
    </div>
  );
}
