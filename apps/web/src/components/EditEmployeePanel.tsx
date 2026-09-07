"use client";

import { useState, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import { useMediaQuery, MOBILE, useIsInSandbox } from "@/hooks";
import {
  validateEmail,
  validateNotes,
  validatePhone,
  validateRequired,
} from "@/components/FormField";
import {
  normalizeOptionalStaffEmail,
  normalizeOptionalUsPhone,
  normalizeStaffName,
  normalizeStaffNotes,
} from "@dubgrid/contracts";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { satisfiesCertificationRequirement } from "@/lib/credential-requirements";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { SectionNotice } from "@/components/ui/SectionNotice";
import { PendingInvitationBanner } from "@/components/staff/PendingInvitationBanner";
import { hasSavedScheduleAssignment } from "@/components/staff/capability-state";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  checkEmployeeEmailConflict,
  type EmployeeEmailConflictResult,
} from "@/features/employees/client";

export interface EditEmployeePanelProps {
  employee: Employee;
  /** Needed only for the real-time duplicate-email check against other
   *  active employees' contact emails. Omit to skip that check (e.g. the
   *  self-profile embedding, which hides the email field entirely). */
  orgId?: string;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  certificationLabel?: string;
  roles: NamedItem[];
  roleLabel?: string;
  focusAreaLabel?: string;
  departments?: NamedItem[];
  departmentLabel?: string;
  /** True when the employee also holds management access (a non-empty
   *  org-membership department assignment). Lets them drop to zero focus
   *  areas — coming off the schedule — without being orphaned, since they
   *  still have management access to fall back on. */
  isManagementUser?: boolean;
  /** Hides first/last name, phone, and email — for embedding this panel
   *  somewhere those are already editable elsewhere (the self-profile page's
   *  own Account details section), so they aren't shown twice. */
  hideIdentityFields?: boolean;
  onSave: (updatedEmployee: Employee) => void | Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (hasUnsavedChanges: boolean) => void;
  /** Reports whether any current form value blocks saving. Hosts using
   *  `hideActions` use this alongside dirty state to disable their own Save. */
  onSaveBlockedChange?: (isBlocked: boolean) => void;
  /** Fires whenever the real-time duplicate-email check's result changes.
   *  In `hideActions` mode the host renders its own Save button driven off
   *  `onDirtyChange` alone, which doesn't know about this or any other
   *  field-level validation state — without this, that button stays
   *  enabled while a conflict is showing, and clicking it silently no-ops
   *  (handleSave still blocks internally) instead of visibly disabling. */
  onEmailConflictChange?: (hasConflict: boolean) => void;
  onInvite?: (emp: Employee) => void;
  pendingInvitation?: Invitation;
  onRevoke?: (invitationId: string) => Promise<boolean> | boolean | void;
  /** Called instead of `onSave` when the admin confirms changing the email
   *  while a pending invitation exists — saves the identity change (which
   *  auto-revokes the old invitation) and sends a fresh one to the new
   *  address, reusing the old invitation's role/departments. Required to
   *  offer the "Save & send" choice; without it, a changed email with a
   *  pending invitation present falls back to a plain save. */
  onSaveWithReinvite?: (
    updatedEmployee: Employee,
    oldInvitation: Invitation,
  ) => void | Promise<void>;
  /** When true, render no Close/Save row — the host renders its own footer and
   *  drives save/dismiss through the ref handle. */
  hideActions?: boolean;
  /** Persistent page editors have no meaningful pristine Close action. */
  persistent?: boolean;
  /** Drops the editor's own side padding so an embedding card owns the inner
   *  padding and the fields line up with that card's heading. */
  flushHorizontal?: boolean;
}

export interface EditEmployeePanelHandle {
  save: () => Promise<boolean>;
  requestDismiss: () => void;
}

type EditForm = {
  firstName: string;
  lastName: string;
  employmentType: Employee["employmentType"];
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  departmentIds: number[];
  phone: string;
  email: string;
  contactNotes: string;
};

function buildEditForm(employee: Employee): EditForm {
  return {
    firstName: employee.firstName || "",
    lastName: employee.lastName || "",
    employmentType: employee.employmentType ?? "full_time",
    certificationId: employee.certificationId ?? null,
    focusAreaIds: employee.focusAreaIds || [],
    roleIds: employee.roleIds || [],
    departmentIds: employee.departmentIds || [],
    phone: employee.phone || "",
    email: employee.email || "",
    contactNotes: employee.contactNotes || "",
  };
}

const EditEmployeePanel = forwardRef<EditEmployeePanelHandle, EditEmployeePanelProps>(
  function EditEmployeePanel(
    {
      employee,
      orgId,
      focusAreas,
      certifications,
      certificationLabel = "Certification",
      roles,
      roleLabel = "Roles",
      focusAreaLabel = "Focus Areas",
      isManagementUser = false,
      hideIdentityFields = false,
      onSave,
      onCancel,
      onDirtyChange,
      onSaveBlockedChange,
      onEmailConflictChange,
      onInvite,
      pendingInvitation,
      onRevoke,
      onSaveWithReinvite,
      hideActions,
      persistent = false,
      flushHorizontal = false,
    }: EditEmployeePanelProps,
    ref,
  ) {
    const isMobile = useMediaQuery(MOBILE);
    const isInSandbox = useIsInSandbox();
    // Set while the "changing this email will revoke the pending invitation"
    // confirm dialog is open — holds the already-validated employee payload
    // handleSave built, so onConfirm/onCancel don't need to redo validation.
    const [pendingReinviteSave, setPendingReinviteSave] = useState<Employee | null>(null);
    const [form, setForm] = useState<EditForm>(() => buildEditForm(employee));

    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [emailConflict, setEmailConflict] = useState(false);
    const [emailConflictReason, setEmailConflictReason] =
      useState<EmployeeEmailConflictResult["reason"]>(undefined);

    // Pre-flight: flag a duplicate contact email before Save is pressed,
    // instead of only surfacing it via the unique_active_employee_email_per_org
    // constraint (or check_employee_email_belongs_to_user) after submit.
    // Debounced, and only meaningful when the email actually changed to a
    // valid, different value. Passes employee.userId so the check can tell
    // "this employee's own login email" apart from "someone else's".
    useEffect(() => {
      const trimmed = form.email.trim();
      if (
        !orgId ||
        !trimmed ||
        trimmed === (employee.email || "").trim() ||
        validateEmail(trimmed)
      ) {
        setEmailConflict(false);
        setEmailConflictReason(undefined);
        return;
      }
      let cancelled = false;
      const timer = setTimeout(() => {
        checkEmployeeEmailConflict(trimmed, orgId, employee.id, employee.userId)
          .then((result) => {
            if (!cancelled) {
              setEmailConflict(result.conflict);
              setEmailConflictReason(result.reason);
            }
          })
          .catch((err) => {
            // Soft fail by design (advisory check, the DB constraint still
            // enforces correctness on submit) — but log it, since a silent
            // failure here (e.g. a permission or network error) looks
            // identical to "the check just doesn't work" with zero signal.
            if (!cancelled) {
              console.error("checkEmployeeEmailConflict failed", err);
              setEmailConflict(false);
              setEmailConflictReason(undefined);
            }
          });
      }, 400);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [form.email, employee.email, employee.id, employee.userId, orgId]);

    useEffect(() => {
      onEmailConflictChange?.(emailConflict);
    }, [emailConflict, onEmailConflictChange]);

    const fieldErrors = useMemo(
      () => ({
        firstName: touched.firstName ? validateRequired(form.firstName, "First name") : null,
        lastName: touched.lastName ? validateRequired(form.lastName, "Last name") : null,
        focusAreaIds:
          touched.focusAreaIds && form.focusAreaIds.length === 0 && !isManagementUser
            ? `At least one ${focusAreaLabel.toLowerCase()} is required`
            : null,
        email: touched.email ? validateEmail(form.email) : null,
        phone: touched.phone ? validatePhone(form.phone) : null,
        contactNotes: touched.contactNotes ? validateNotes(form.contactNotes) : null,
      }),
      [form, touched, focusAreaLabel, isManagementUser],
    );

    const markTouched = useCallback((field: string) => {
      setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
    }, []);

    useEffect(() => {
      setForm(buildEditForm(employee));
      setTouched({});
    }, [employee]);

    const isModified = useMemo(() => {
      return (
        (form.firstName || "") !== (employee.firstName || "") ||
        (form.lastName || "") !== (employee.lastName || "") ||
        form.employmentType !== (employee.employmentType ?? "full_time") ||
        form.certificationId !== employee.certificationId ||
        (form.phone || "") !== (employee.phone || "") ||
        (form.email || "") !== (employee.email || "") ||
        (form.contactNotes || "") !== (employee.contactNotes || "") ||
        form.focusAreaIds.length !== employee.focusAreaIds.length ||
        form.focusAreaIds.some((id) => !employee.focusAreaIds.includes(id)) ||
        form.roleIds.length !== employee.roleIds.length ||
        form.roleIds.some((id) => !employee.roleIds.includes(id)) ||
        form.departmentIds.length !== employee.departmentIds.length ||
        form.departmentIds.some((id) => !employee.departmentIds.includes(id))
      );
    }, [form, employee]);

    useEffect(() => {
      onDirtyChange?.(isModified);
    }, [isModified, onDirtyChange]);

    const isSaveBlocked = useMemo(
      () =>
        Boolean(
          !form.firstName.trim() ||
          !form.lastName.trim() ||
          (form.focusAreaIds.length === 0 && !isManagementUser) ||
          validateRequired(form.firstName, "First name") ||
          validateRequired(form.lastName, "Last name") ||
          validateEmail(form.email) ||
          validatePhone(form.phone) ||
          validateNotes(form.contactNotes) ||
          emailConflict,
        ),
      [form, isManagementUser, emailConflict],
    );

    useEffect(() => {
      onSaveBlockedChange?.(isSaveBlocked);
    }, [isSaveBlocked, onSaveBlockedChange]);

    const handleSave = useCallback(async (): Promise<boolean> => {
      if (
        !form.firstName.trim() ||
        !form.lastName.trim() ||
        (form.focusAreaIds.length === 0 && !isManagementUser)
      ) {
        setTouched({
          firstName: true,
          lastName: true,
          focusAreaIds: true,
          email: true,
          phone: true,
        });
        return false;
      }
      if (
        validateRequired(form.firstName, "First name") ||
        validateRequired(form.lastName, "Last name") ||
        validateEmail(form.email) ||
        validatePhone(form.phone) ||
        validateNotes(form.contactNotes) ||
        emailConflict
      ) {
        setTouched({
          firstName: true,
          lastName: true,
          focusAreaIds: true,
          email: true,
          phone: true,
          contactNotes: true,
        });
        return false;
      }
      const nextEmployee: Employee = {
        ...employee,
        firstName: normalizeStaffName(form.firstName),
        lastName: normalizeStaffName(form.lastName),
        employmentType: form.employmentType,
        certificationId: form.certificationId,
        focusAreaIds: form.focusAreaIds,
        roleIds: form.roleIds,
        departmentIds: form.departmentIds,
        phone: normalizeOptionalUsPhone(form.phone),
        email: normalizeOptionalStaffEmail(form.email),
        contactNotes: normalizeStaffNotes(form.contactNotes),
      };

      // Changing the email while a pending invitation exists will silently
      // revoke it (trg_revoke_invitation_on_email_change). Never let that
      // happen as a side effect of a plain save — gate it behind an explicit
      // choice instead of saving right away.
      const emailChanged = (nextEmployee.email || "") !== (employee.email || "");
      if (emailChanged && pendingInvitation && onSaveWithReinvite) {
        setPendingReinviteSave(nextEmployee);
        return false;
      }

      await onSave(nextEmployee);
      return true;
    }, [
      form,
      employee,
      onSave,
      onSaveWithReinvite,
      pendingInvitation,
      isManagementUser,
      emailConflict,
    ]);

    const handleDismiss = useCallback(() => {
      if (isModified) {
        setForm(buildEditForm(employee));
        setTouched({});
        return;
      }

      onCancel();
    }, [employee, isModified, onCancel]);

    useImperativeHandle(ref, () => ({ save: handleSave, requestDismiss: handleDismiss }), [
      handleSave,
      handleDismiss,
    ]);

    const toggleRole = useCallback(
      (roleId: number) =>
        setForm((p) => ({
          ...p,
          roleIds: p.roleIds.includes(roleId)
            ? p.roleIds.filter((id) => id !== roleId)
            : [...p.roleIds, roleId],
        })),
      [],
    );

    // Recomputed from props and form state on every render, so it answers to a
    // change of either the selected certification or the org's role config.
    const isRoleBlocked = useCallback(
      (roleId: number) => {
        const role = roles.find((r) => r.id === roleId);
        if (!role) return false;
        return !satisfiesCertificationRequirement({
          heldIds: [form.certificationId ?? null],
          requiredIds: role.requiredCertificationIds ?? [],
        });
      },
      [roles, form.certificationId],
    );

    const toggleFocusArea = useCallback(
      (focusAreaId: number) =>
        setForm((p) => ({
          ...p,
          focusAreaIds: p.focusAreaIds.includes(focusAreaId)
            ? p.focusAreaIds.filter((id) => id !== focusAreaId)
            : [...p.focusAreaIds, focusAreaId],
        })),
      [],
    );

    // What saving would do, gathered per section. Field-level validation is not
    // in here: it stays as the coloured hint under its own input, and a filled
    // box only ever means a consequence of the save.
    const detailsNotices = useMemo(() => {
      const notices: string[] = [];
      if (employee.userId && form.email !== employee.email && !emailConflict) {
        notices.push("Changing the contact email does not change their login email.");
      }
      return notices;
    }, [employee.userId, employee.email, form.email, emailConflict]);

    // Only someone with management access can come off the schedule. For anyone
    // else the focus areas are the whole staff record, so an empty set is the
    // required-field error on the field itself rather than a consequence.
    const assignmentNotices = useMemo(() => {
      const notices: string[] = [];
      if (isManagementUser && form.focusAreaIds.length === 0) {
        notices.push("Saving now removes them from the schedule. They'll keep management access.");
      }
      return notices;
    }, [isManagementUser, form.focusAreaIds.length]);
    // A management user can draft removal from the schedule and still reverse it
    // before saving. Once the saved record no longer has a focus-area assignment,
    // the entire schedule-only section must disappear on every editor surface.
    const showScheduleAssignments = !isManagementUser || hasSavedScheduleAssignment(employee);

    const fieldLabel: React.CSSProperties = {
      fontSize: "var(--dg-type-field-title-size)",
      fontWeight: "var(--dg-type-field-title-weight)",
      color: "var(--dg-type-field-title-color)",
      letterSpacing: "var(--dg-type-field-title-letter-spacing)",
      lineHeight: "var(--dg-type-field-title-line-height)",
      display: "block",
      marginBottom: 4,
    };

    const canEdit = employee.status === "active" || employee.status === "inactive";
    const readOnly = !canEdit;
    const sidePadding = flushHorizontal ? "0" : isMobile ? "16px" : "24px";

    return (
      <>
        <div
          style={{
            padding: isMobile
              ? hideActions
                ? `16px ${sidePadding} 0`
                : `16px ${sidePadding} 24px`
              : hideActions
                ? `0 ${sidePadding}`
                : `0 ${sidePadding} 28px`,
          }}
        >
          {/* A removed employee's record is read-only, not disabled: every field
              below already carries its own `readOnly`/`disabled`, so dimming the
              whole card only made the record look broken and blocked selecting
              text out of it. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* ── Details section ── */}
            <div style={{ paddingTop: 20, paddingBottom: 20 }}>
              <div className="dg-type-content-group-heading" style={{ marginBottom: 8 }}>
                Details
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <SectionNotice messages={detailsNotices} tone="warning" />
                {!hideIdentityFields && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={fieldLabel}>
                        First name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                      </label>
                      <input
                        className="dg-input"
                        value={form.firstName}
                        onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                        onBlur={() => markTouched("firstName")}
                        placeholder="e.g. Maria"
                        readOnly={readOnly}
                        style={
                          fieldErrors.firstName
                            ? { borderColor: "var(--dg-color-danger)" }
                            : undefined
                        }
                      />
                      {fieldErrors.firstName && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                            marginTop: 4,
                          }}
                          role="alert"
                        >
                          {fieldErrors.firstName}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={fieldLabel}>
                        Last name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                      </label>
                      <input
                        className="dg-input"
                        value={form.lastName}
                        onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                        onBlur={() => markTouched("lastName")}
                        placeholder="e.g. Garcia"
                        readOnly={readOnly}
                        style={
                          fieldErrors.lastName
                            ? { borderColor: "var(--dg-color-danger)" }
                            : undefined
                        }
                      />
                      {fieldErrors.lastName && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                            marginTop: 4,
                          }}
                          role="alert"
                        >
                          {fieldErrors.lastName}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {showScheduleAssignments && (
                  <div>
                    <label style={fieldLabel}>Employment</label>
                    <CustomSelect
                      value={form.employmentType}
                      options={[
                        { value: "full_time", label: "Full-time" },
                        { value: "part_time", label: "Part-time" },
                      ]}
                      onChange={(v) =>
                        setForm((p) => ({
                          ...p,
                          employmentType: v === "part_time" ? "part_time" : "full_time",
                        }))
                      }
                      disabled={readOnly}
                      style={{ width: isMobile ? "100%" : "min(280px, 100%)" }}
                    />
                  </div>
                )}

                {!hideIdentityFields && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={fieldLabel}>Phone</label>
                      <input
                        className="dg-input"
                        value={form.phone}
                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                        onBlur={() => markTouched("phone")}
                        onBlurCapture={() => {
                          if (!validatePhone(form.phone)) {
                            setForm((p) => ({
                              ...p,
                              phone: normalizeOptionalUsPhone(p.phone),
                            }));
                          }
                        }}
                        placeholder="(415) 555-0100"
                        readOnly={readOnly}
                        style={
                          fieldErrors.phone ? { borderColor: "var(--dg-color-danger)" } : undefined
                        }
                      />
                      {fieldErrors.phone && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                            marginTop: 4,
                          }}
                          role="alert"
                        >
                          {fieldErrors.phone}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={fieldLabel}>Email</label>
                      <input
                        className="dg-input"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                        onBlur={() => markTouched("email")}
                        placeholder="name@example.com"
                        readOnly={readOnly}
                        style={
                          fieldErrors.email ? { borderColor: "var(--dg-color-danger)" } : undefined
                        }
                      />
                      {fieldErrors.email && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                            marginTop: 4,
                          }}
                          role="alert"
                        >
                          {fieldErrors.email}
                        </div>
                      )}
                      {!fieldErrors.email && emailConflict && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                            marginTop: 4,
                          }}
                          role="alert"
                        >
                          {emailConflictReason === "gridmaster"
                            ? "That email address is reserved."
                            : "That email is already used by another person on your team."}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label style={fieldLabel}>Internal notes</label>
                  <textarea
                    className="dg-input"
                    value={form.contactNotes}
                    onChange={(e) => setForm((p) => ({ ...p, contactNotes: e.target.value }))}
                    onBlur={() => markTouched("contactNotes")}
                    placeholder="Preferences, availability, etc."
                    rows={2}
                    style={{
                      resize: "vertical",
                      minHeight: 64,
                    }}
                    readOnly={readOnly}
                  />
                  {fieldErrors.contactNotes && (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--dg-color-danger)",
                        marginTop: 4,
                      }}
                      role="alert"
                    >
                      {fieldErrors.contactNotes}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {showScheduleAssignments && (
              <div
                style={{
                  borderTop: "1px solid var(--dg-color-border-light)",
                  paddingTop: 20,
                  paddingBottom: 20,
                }}
              >
                <div className="dg-type-content-group-heading" style={{ marginBottom: 8 }}>
                  Assignments
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <SectionNotice messages={assignmentNotices} />
                  <div>
                    <label style={fieldLabel}>{certificationLabel}</label>
                    <CustomSelect
                      value={form.certificationId != null ? String(form.certificationId) : ""}
                      options={[
                        { value: "", label: "— None —" },
                        ...certifications.map((d) => ({
                          value: String(d.id),
                          label: d.name,
                        })),
                      ]}
                      onChange={(v) =>
                        setForm((p) => ({
                          ...p,
                          certificationId: v ? Number(v) : null,
                        }))
                      }
                      disabled={readOnly}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label style={fieldLabel}>
                      {focusAreaLabel}
                      {!isManagementUser && (
                        <span style={{ color: "var(--dg-color-danger)" }}> *</span>
                      )}
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {focusAreas.map((focusArea) => {
                        const active = form.focusAreaIds.includes(focusArea.id);
                        return (
                          <SelectableTag
                            key={focusArea.id}
                            selected={active}
                            onClick={() => {
                              toggleFocusArea(focusArea.id);
                              markTouched("focusAreaIds");
                            }}
                            disabled={readOnly}
                            padding="5px 12px"
                          >
                            {focusArea.name}
                          </SelectableTag>
                        );
                      })}
                    </div>
                    {fieldErrors.focusAreaIds && (
                      <div
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-danger)",
                          marginTop: 4,
                        }}
                        role="alert"
                      >
                        {fieldErrors.focusAreaIds}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={fieldLabel}>{roleLabel}</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {roles
                        .filter((role) => form.roleIds.includes(role.id) || !isRoleBlocked(role.id))
                        .map((role) => {
                          const active = form.roleIds.includes(role.id);
                          return (
                            <SelectableTag
                              key={role.id}
                              selected={active}
                              onClick={() => toggleRole(role.id)}
                              disabled={readOnly}
                              padding="5px 12px"
                            >
                              {role.name}
                            </SelectableTag>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Invite status ── */}
          {canEdit &&
            !employee.userId &&
            employee.email &&
            ((pendingInvitation && onRevoke) || onInvite) && (
              <div
                style={{
                  borderTop: "1px solid var(--dg-color-border-light)",
                  paddingTop: 16,
                  paddingBottom: 4,
                }}
              >
                {pendingInvitation && onRevoke ? (
                  <PendingInvitationBanner
                    pendingInvitation={pendingInvitation}
                    onReinvite={
                      onInvite
                        ? async () => {
                            const result = await onRevoke(pendingInvitation.id);
                            if (result === false) return;
                            onInvite(employee);
                          }
                        : undefined
                    }
                    onRevoke={onRevoke}
                    isInSandbox={isInSandbox}
                  />
                ) : onInvite ? (
                  <Button
                    onClick={() => onInvite(employee)}
                    className="dg-btn dg-btn-ghost"
                    style={{
                      color: "var(--dg-color-link)",
                      fontSize: "var(--dg-fs-caption)",
                      padding: "6px 10px",
                      width: "100%",
                      justifyContent: "center",
                      border: "1px dashed var(--dg-color-brand-border)",
                      borderRadius: "var(--dg-btn-radius)",
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    Send Invitation
                  </Button>
                ) : null}
              </div>
            )}

          {/* ── Actions ── */}
          {!hideActions && (
            <div
              style={{
                paddingTop: 16,
                borderTop: "1px solid var(--dg-color-border-light)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Primary actions */}
              {canEdit && (
                <EditorActionRow
                  secondaryAction={
                    !persistent || isModified ? (
                      <Button onClick={handleDismiss} className="dg-btn dg-btn-secondary">
                        {getEditorDismissLabel({ hasUnsavedChanges: isModified })}
                      </Button>
                    ) : undefined
                  }
                  primaryAction={
                    <Button
                      onClick={handleSave}
                      disabled={!isModified || isSaveBlocked}
                      className="dg-btn dg-btn-primary"
                    >
                      {EDITOR_ACTION_LABELS.save}
                    </Button>
                  }
                />
              )}
              {!canEdit && (
                <EditorActionRow
                  secondaryAction={
                    <Button onClick={onCancel} className="dg-btn dg-btn-secondary">
                      {EDITOR_ACTION_LABELS.close}
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </div>
        {pendingReinviteSave && pendingInvitation && onSaveWithReinvite && (
          <ConfirmDialog
            title="Send a new invitation?"
            message={
              <>
                Changing the email will revoke the pending invitation to{" "}
                <strong>{pendingInvitation.email}</strong>. Save and send a new invitation to{" "}
                <strong>{pendingReinviteSave.email}</strong>?
              </>
            }
            confirmLabel="Save & send"
            cancelLabel="Cancel"
            variant="warning"
            onCancel={() => setPendingReinviteSave(null)}
            onConfirm={async () => {
              await onSaveWithReinvite(pendingReinviteSave, pendingInvitation);
              setPendingReinviteSave(null);
            }}
          />
        )}
      </>
    );
  },
);

export default EditEmployeePanel;
