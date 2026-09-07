"use client";

import { useCallback, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import type { DirectoryPerson, Employee, FocusArea, NamedItem } from "@/types";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { EmployeeProfileConflictError, updateEmployee } from "@/features/employees/client";
import { formatClientErrorMessage } from "@/lib/client-facing";

/** Only the read-only prefill fields this modal actually needs — satisfied by
 *  both `DirectoryPerson` (People directory) and `Employee` (self/detail
 *  views), so callers with just an `Employee` in scope can pass it directly. */
type SchedulePrefillPerson = Pick<
  DirectoryPerson,
  "firstName" | "lastName" | "email" | "certificationId" | "focusAreaIds" | "roleIds" | "userId"
>;

interface AddManagementUserToScheduleModalProps {
  orgId: string;
  person: SchedulePrefillPerson;
  /** The existing employees row for this management member. Every org member
   *  carries an employees row (post-Flow-B), so the parent always has one
   *  to pass; this modal patches its scheduling attributes in place rather
   *  than creating a new row. */
  employee: Employee;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
  onClose: () => void;
  onAdded: (employee: Employee) => void;
}

export function AddManagementUserToScheduleModal({
  orgId,
  person,
  employee,
  focusAreas,
  certifications,
  roles,
  focusAreaLabel = "Focus Areas",
  certificationLabel = "Certification",
  roleLabel = "Roles",
  onClose,
  onAdded,
}: AddManagementUserToScheduleModalProps) {
  const [employmentType, setEmploymentType] = useState(employee.employmentType);
  const [certificationId, setCertificationId] = useState<number | null>(person.certificationId);
  const [focusAreaIds, setFocusAreaIds] = useState<number[]>(person.focusAreaIds);
  const [roleIds, setRoleIds] = useState<number[]>(person.roleIds);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const initialDraftSnapshot = useMemo(
    () =>
      JSON.stringify({
        employmentType: employee.employmentType,
        certificationId: person.certificationId,
        focusAreaIds: [...person.focusAreaIds].sort((left, right) => left - right),
        roleIds: [...person.roleIds].sort((left, right) => left - right),
      }),
    [employee.employmentType, person],
  );
  const hasUnsavedChanges =
    JSON.stringify({
      employmentType,
      certificationId,
      focusAreaIds: [...focusAreaIds].sort((left, right) => left - right),
      roleIds: [...roleIds].sort((left, right) => left - right),
    }) !== initialDraftSnapshot;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges,
    onDiscard: onClose,
  });
  const handleRequestClose = useCallback(() => {
    if (!saving && requestClose()) {
      onClose();
    }
  }, [onClose, requestClose, saving]);

  const fieldErrors = useMemo(
    () => ({
      focusAreaIds:
        touched.focusAreaIds && focusAreaIds.length === 0
          ? `At least one ${focusAreaLabel.toLowerCase()} is required`
          : null,
    }),
    [focusAreaIds, focusAreaLabel, touched],
  );

  const canSubmit = !!person.userId && focusAreaIds.length > 0 && !saving;

  function markTouched(field: string) {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }

  function toggleFocusArea(focusAreaId: number) {
    setFocusAreaIds((prev) =>
      prev.includes(focusAreaId) ? prev.filter((id) => id !== focusAreaId) : [...prev, focusAreaId],
    );
    markTouched("focusAreaIds");
  }

  function toggleRole(roleId: number) {
    setRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  }

  async function handleSubmit() {
    if (!person.userId || !canSubmit) {
      setTouched({
        focusAreaIds: true,
      });
      return;
    }

    setSaving(true);
    try {
      // PATCH only schedule assignments. Existing profile details and access
      // fields remain untouched and continue to be edited in Profile details.
      const updated: Employee = {
        ...employee,
        employmentType,
        certificationId,
        focusAreaIds,
        roleIds,
      };
      const savedEmployee = await updateEmployee(updated, orgId, employee.version);
      toast.success("Added to the schedule");
      onAdded(savedEmployee);
      onClose();
    } catch (err) {
      if (err instanceof EmployeeProfileConflictError) {
        onAdded(err.latestEmployee);
        toast.error("Staff details changed elsewhere. Review the latest values and try again.");
        return;
      }
      toast.error(
        formatClientErrorMessage(err, "We couldn't add them to the schedule. Try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        title="Add to Schedule"
        onClose={onClose}
        onRequestClose={() => !saving && requestClose()}
        style={{ maxWidth: 560, width: "100%" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--dg-radius-lg)",
              background: "var(--dg-color-bg-secondary)",
              color: "var(--dg-color-text-secondary)",
              fontSize: "var(--dg-fs-label)",
            }}
          >
            Put{" "}
            <strong>
              {person.firstName || person.lastName
                ? `${person.firstName} ${person.lastName}`.trim()
                : person.email}
            </strong>{" "}
            on the schedule so you can assign them shifts. They'll keep their login and management
            access.
          </div>

          <div>
            <label style={fieldLabelStyle}>Employment</label>
            <CustomSelect
              value={employmentType}
              options={[
                { value: "full_time", label: "Full-time" },
                { value: "part_time", label: "Part-time" },
              ]}
              onChange={(value) =>
                setEmploymentType(value === "part_time" ? "part_time" : "full_time")
              }
            />
          </div>

          <div>
            <label style={fieldLabelStyle}>
              {focusAreaLabel} <span style={{ color: "var(--dg-color-danger)" }}>*</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {focusAreas.map((focusArea) => {
                const active = focusAreaIds.includes(focusArea.id);
                return (
                  <SelectableTag
                    key={focusArea.id}
                    selected={active}
                    onClick={() => toggleFocusArea(focusArea.id)}
                    padding="5px 12px"
                  >
                    {focusArea.name}
                  </SelectableTag>
                );
              })}
            </div>
            {fieldErrors.focusAreaIds && <FieldError message={fieldErrors.focusAreaIds} />}
          </div>

          <div>
            <label style={fieldLabelStyle}>{certificationLabel}</label>
            <CustomSelect
              value={certificationId != null ? String(certificationId) : ""}
              options={[
                { value: "", label: "— None —" },
                ...certifications.map((item) => ({
                  value: String(item.id),
                  label: item.name !== item.abbr ? `${item.name} (${item.abbr})` : item.name,
                })),
              ]}
              onChange={(value) => setCertificationId(value ? Number(value) : null)}
            />
          </div>

          <div>
            <label style={fieldLabelStyle}>{roleLabel}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {roles.map((role) => (
                <SelectableTag
                  key={role.id}
                  selected={roleIds.includes(role.id)}
                  onClick={() => toggleRole(role.id)}
                  padding="5px 12px"
                >
                  {role.name}
                </SelectableTag>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button className="dg-btn dg-btn-secondary" onClick={handleRequestClose}>
              {EDITOR_ACTION_LABELS.close}
            </Button>
            <Button
              className="dg-btn dg-btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{ opacity: canSubmit ? 1 : 0.5 }}
            >
              <ButtonLoading loading={saving} spinnerSize={16}>
                Add to Schedule
              </ButtonLoading>
            </Button>
          </div>
        </div>
      </Modal>
      {unsavedChangesDialog}
    </>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <div
      style={{
        color: "var(--dg-color-danger)",
        fontSize: "var(--dg-fs-footnote)",
        marginTop: 4,
      }}
      role="alert"
    >
      {message}
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--dg-type-field-title-size)",
  fontWeight: "var(--dg-type-field-title-weight)",
  color: "var(--dg-type-field-title-color)",
  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
  lineHeight: "var(--dg-type-field-title-line-height)",
  marginBottom: 6,
};
