"use client";

import { useCallback, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { validateEmail, validatePhone, validateRequired } from "@/components/FormField";
import { normalizeOptionalUsPhone } from "@dubgrid/contracts";
import { toast } from "sonner";
import type { DirectoryPerson, Employee, FocusArea, NamedItem } from "@/types";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { updateEmployee } from "@/features/employees/client";
import { formatClientErrorMessage } from "@/lib/client-facing";

/** Only the read-only prefill fields this modal actually needs — satisfied by
 *  both `DirectoryPerson` (People directory) and `Employee` (self/detail
 *  views), so callers with just an `Employee` in scope can pass it directly. */
type SchedulePrefillPerson = Pick<
  DirectoryPerson,
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "certificationId"
  | "focusAreaIds"
  | "roleIds"
  | "userId"
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
  const [firstName, setFirstName] = useState(person.firstName);
  const [lastName, setLastName] = useState(person.lastName);
  const [email, setEmail] = useState(person.email);
  const [phone, setPhone] = useState(person.phone);
  const [certificationId, setCertificationId] = useState<number | null>(person.certificationId);
  const [focusAreaIds, setFocusAreaIds] = useState<number[]>(person.focusAreaIds);
  const [roleIds, setRoleIds] = useState<number[]>(person.roleIds);
  const [contactNotes, setContactNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const initialDraftSnapshot = useMemo(
    () =>
      JSON.stringify({
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
        certificationId: person.certificationId,
        focusAreaIds: [...person.focusAreaIds].sort((left, right) => left - right),
        roleIds: [...person.roleIds].sort((left, right) => left - right),
        contactNotes: "",
      }),
    [person],
  );
  const hasUnsavedChanges =
    JSON.stringify({
      firstName,
      lastName,
      email,
      phone,
      certificationId,
      focusAreaIds: [...focusAreaIds].sort((left, right) => left - right),
      roleIds: [...roleIds].sort((left, right) => left - right),
      contactNotes,
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
      firstName: touched.firstName ? validateRequired(firstName, "First name") : null,
      lastName: touched.lastName ? validateRequired(lastName, "Last name") : null,
      // Email is optional — admin can schedule someone before onboarding
      // (no email yet) and fill it in later when inviting. Validate only
      // when a value is present.
      email: touched.email && email.trim() ? validateEmail(email) : null,
      phone: touched.phone ? validatePhone(phone) : null,
      focusAreaIds:
        touched.focusAreaIds && focusAreaIds.length === 0
          ? `At least one ${focusAreaLabel.toLowerCase()} is required`
          : null,
    }),
    [email, firstName, focusAreaIds, focusAreaLabel, lastName, touched],
  );

  const canSubmit =
    !!person.userId &&
    !validateRequired(firstName, "First name") &&
    !validateRequired(lastName, "Last name") &&
    (!email.trim() || !validateEmail(email)) &&
    !validatePhone(phone) &&
    focusAreaIds.length > 0 &&
    !saving;

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
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        focusAreaIds: true,
      });
      return;
    }

    setSaving(true);
    try {
      // PATCH the existing employees row with scheduling attributes.
      // employee_number / id / user_id / status / employmentType / etc.
      // are preserved by spreading the existing row.
      const updated: Employee = {
        ...employee,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: normalizeOptionalUsPhone(phone),
        certificationId,
        focusAreaIds,
        roleIds,
        contactNotes: contactNotes.trim(),
      };
      await updateEmployee(updated, orgId, employee.version);
      toast.success("Added to the schedule");
      onAdded(updated);
      onClose();
    } catch (err) {
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={fieldLabelStyle}>First name</label>
              <input
                className="dg-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={() => markTouched("firstName")}
                style={
                  fieldErrors.firstName ? { borderColor: "var(--dg-color-danger)" } : undefined
                }
              />
              {fieldErrors.firstName && <FieldError message={fieldErrors.firstName} />}
            </div>
            <div>
              <label style={fieldLabelStyle}>Last name</label>
              <input
                className="dg-input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onBlur={() => markTouched("lastName")}
                style={fieldErrors.lastName ? { borderColor: "var(--dg-color-danger)" } : undefined}
              />
              {fieldErrors.lastName && <FieldError message={fieldErrors.lastName} />}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={fieldLabelStyle}>
                Email{" "}
                <span style={{ fontWeight: 400, color: "var(--dg-color-text-muted)" }}>
                  (optional)
                </span>
              </label>
              <input
                className="dg-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => markTouched("email")}
                style={fieldErrors.email ? { borderColor: "var(--dg-color-danger)" } : undefined}
              />
              {fieldErrors.email && <FieldError message={fieldErrors.email} />}
            </div>
            <div>
              <label style={fieldLabelStyle}>Phone</label>
              <input
                className="dg-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => {
                  markTouched("phone");
                  if (!validatePhone(phone)) {
                    setPhone(normalizeOptionalUsPhone(phone));
                  }
                }}
                style={fieldErrors.phone ? { borderColor: "var(--dg-color-danger)" } : undefined}
              />
              {fieldErrors.phone && <FieldError message={fieldErrors.phone} />}
            </div>
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
                    unselectedBackground="var(--dg-color-bg-secondary)"
                    unselectedBorderColor="transparent"
                    unselectedTextColor="var(--dg-color-text-faint)"
                  >
                    {focusArea.name}
                  </SelectableTag>
                );
              })}
            </div>
            {fieldErrors.focusAreaIds && <FieldError message={fieldErrors.focusAreaIds} />}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
                  unselectedBackground="var(--dg-color-bg-secondary)"
                  unselectedBorderColor="transparent"
                  unselectedTextColor="var(--dg-color-text-faint)"
                >
                  {role.abbr}
                </SelectableTag>
              ))}
            </div>
          </div>

          <div>
            <label style={fieldLabelStyle}>Internal notes</label>
            <textarea
              className="dg-input"
              value={contactNotes}
              onChange={(e) => setContactNotes(e.target.value)}
              rows={3}
              style={{ resize: "vertical", minHeight: 72 }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button className="dg-btn dg-btn-ghost" onClick={handleRequestClose}>
              {EDITOR_ACTION_LABELS.close}
            </Button>
            <Button
              className="dg-btn dg-btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{ opacity: canSubmit ? 1 : 0.5 }}
            >
              <ButtonLoading loading={saving} loadingLabel="Adding" spinnerSize={16}>
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
  fontSize: "var(--dg-fs-label)",
  fontWeight: 600,
  color: "var(--dg-color-text-secondary)",
  marginBottom: 6,
};
