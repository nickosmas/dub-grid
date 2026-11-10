"use client";

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useId,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import {
  Employee,
  FocusArea,
  NamedItem,
  Invitation,
  type AdminPermissions,
  type AssignableOrganizationRole,
} from "@/types";
import { InviteOptionBox } from "@/components/staff/InviteOptionBox";
import {
  INVITE_ON_SAVE_LABELS,
  describeInviteOnSave,
  describeInviteOnSaveNote,
  INVITE_ON_SAVE_BUTTON_LABEL,
  type InviteOnSaveChoice,
} from "@/features/employees/client/invite-on-save";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import { useMediaQuery, MOBILE, useIsInSandbox } from "@/hooks";
import { useStepUpAction, type StepUpRun } from "@/hooks/useStepUpAction";
import { useLatestRef } from "@/hooks/useLatestRef";
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
import { FirstDayField } from "@/components/staff/FirstDayField";
import { upcomingFirstDay, DEFAULT_ORGANIZATION_LABELS, singularLabelNoun } from "@dubgrid/domain";
import { formatDateKey } from "@/lib/utils";
import { PendingInvitationBanner } from "@/components/staff/PendingInvitationBanner";
import { hasSavedScheduleAssignment } from "@/components/staff/capability-state";
import {
  checkEmployeeEmailConflict,
  checkEmployeePhoneConflict,
  fetchEmployeeHasStarted,
} from "@/features/employees/client";
import {
  EMAIL_BELONGS_TO_SOMEONE_ELSE,
  PHONE_BELONGS_TO_SOMEONE_ELSE,
} from "@/lib/employee-contact-conflicts";

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
  onSave: (updatedEmployee: Employee) => boolean | void | Promise<boolean | void>;
  /** Called after the primary employee save succeeds. Slideover hosts use
   *  this to dismiss after either the ordinary save or Save & send path. */
  onSaveCompleted?: () => void;
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
  /** Offered beside a joined person's locked email, when this viewer may move them. */
  onMoveToNewEmail?: () => void;
  onRevoke?: (invitationId: string) => Promise<boolean> | boolean | void;
  onResend?: (invitationId: string) => Promise<boolean> | boolean | void;
  /** Offers an invite beside the email (the staff page and the People
   *  slideover). Saving with the box ticked calls `onSaveAndInvite` instead
   *  of `onSave`. */
  inviteOnSave?: {
    canInvite: boolean;
    roleOptions: { value: AssignableOrganizationRole; label: string }[];
    /** A Super Admin picks an Admin's permissions before the invite goes out. */
    canSetAdminPermissions: boolean;
    onSaveAndInvite: (
      updatedEmployee: Employee,
      invite: InviteOnSaveChoice,
      runStepUp: StepUpRun,
    ) => boolean | void | Promise<boolean | void>;
  };
  /** Reports the save button's label for a host that draws its own, such as "Save & invite". */
  onSaveLabelChange?: (label: string | undefined) => void;
  /** When true, render no Close/Save row — the host renders its own footer and
   *  drives save/dismiss through the ref handle. */
  hideActions?: boolean;
  /** Persistent page editors have no meaningful pristine Close action. */
  persistent?: boolean;
  /** Draws Details and Work as one card on the page, for editing in place. */
  sectioned?: boolean;
  /** Drops the editor's own side padding so an embedding card owns the inner
   *  padding and the fields line up with that card's heading. */
  flushHorizontal?: boolean;
}

export interface EditEmployeePanelHandle {
  save: () => Promise<boolean>;
  requestDismiss: () => void;
  focusEmail: () => void;
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
  /** Their first day (YYYY-MM-DD, 51g4), or empty for none. */
  firstDay: string;
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
    firstDay: employee.firstDay ?? "",
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
      focusAreaLabel = DEFAULT_ORGANIZATION_LABELS.focusArea,
      isManagementUser = false,
      hideIdentityFields = false,
      onSave,
      onSaveCompleted,
      onCancel,
      onDirtyChange,
      onSaveBlockedChange,
      onEmailConflictChange,
      onInvite,
      pendingInvitation,
      onMoveToNewEmail,
      onRevoke,
      onResend,
      inviteOnSave,
      onSaveLabelChange,
      hideActions,
      persistent = false,
      sectioned = false,
      flushHorizontal = false,
    }: EditEmployeePanelProps,
    ref,
  ) {
    const isMobile = useMediaQuery(MOBILE);
    const isInSandbox = useIsInSandbox();
    const stepUp = useStepUpAction();
    const stepUpRef = useLatestRef(stepUp);
    const identityFieldIdPrefix = useId();
    const emailInputRef = useRef<HTMLInputElement>(null);
    // Set while the "changing this email will revoke the pending invitation"
    // confirm dialog is open — holds the already-validated employee payload
    // handleSave built, so onConfirm/onCancel don't need to redo validation.
    const [form, setForm] = useState<EditForm>(() => buildEditForm(employee));
    const [hasStarted, setHasStarted] = useState<boolean | null>(null);

    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [emailConflict, setEmailConflict] = useState(false);
    const [phoneConflict, setPhoneConflict] = useState(false);
    // Null until the box is clicked, so it follows its default as the email changes.
    const [inviteTicked, setInviteTicked] = useState<boolean | null>(null);
    const [inviteRole, setInviteRole] = useState<AssignableOrganizationRole>("user");
    const [invitePermissions, setInvitePermissions] = useState<AdminPermissions | null>(null);
    const resetInviteChoice = useCallback(() => {
      setInviteTicked(null);
      setInviteRole("user");
      setInvitePermissions(null);
    }, []);

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
        return;
      }
      let cancelled = false;
      const timer = setTimeout(() => {
        checkEmployeeEmailConflict(trimmed, orgId, employee.id)
          .then((result) => {
            if (!cancelled) {
              setEmailConflict(result.conflict);
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

    useEffect(() => {
      const trimmed = form.phone.trim();
      const digits = trimmed.replace(/\D/g, "");
      if (
        !orgId ||
        !digits ||
        digits === (employee.phone || "").replace(/\D/g, "") ||
        validatePhone(trimmed)
      ) {
        setPhoneConflict(false);
        return;
      }
      let cancelled = false;
      const timer = setTimeout(() => {
        checkEmployeePhoneConflict(trimmed, orgId, employee.id)
          .then((result) => {
            if (!cancelled) setPhoneConflict(result.conflict);
          })
          .catch((err) => {
            if (!cancelled) {
              console.error("checkEmployeePhoneConflict failed", err);
              setPhoneConflict(false);
            }
          });
      }, 400);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [form.phone, employee.phone, employee.id, orgId]);

    // The email is the login email, so a linked account cannot be left without one.
    const validateStaffEmail = useCallback(
      (value: string) =>
        employee.userId && !value.trim()
          ? "An account needs an email to sign in with."
          : validateEmail(value),
      [employee.userId],
    );

    const fieldErrors = useMemo(
      () => ({
        firstName: touched.firstName ? validateRequired(form.firstName, "First name") : null,
        lastName: touched.lastName ? validateRequired(form.lastName, "Last name") : null,
        focusAreaIds:
          touched.focusAreaIds && form.focusAreaIds.length === 0 && !isManagementUser
            ? `At least one ${singularLabelNoun(focusAreaLabel)} is required`
            : null,
        email: touched.email ? validateStaffEmail(form.email) : null,
        phone: touched.phone ? validatePhone(form.phone) : null,
        contactNotes: touched.contactNotes ? validateNotes(form.contactNotes) : null,
      }),
      [form, touched, focusAreaLabel, isManagementUser, validateStaffEmail],
    );

    const markTouched = useCallback((field: string) => {
      setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
    }, []);

    // Editing in place outlives a background refetch, which hands back the same
    // record as a new object: only a real change replaces what's being typed.
    const loadedRecordRef = useRef({ id: employee.id, version: employee.version });
    useEffect(() => {
      const loaded = loadedRecordRef.current;
      const unchanged = loaded.id === employee.id && loaded.version === employee.version;
      loadedRecordRef.current = { id: employee.id, version: employee.version };
      if (persistent && unchanged) return;
      setForm(buildEditForm(employee));
      setTouched({});
      resetInviteChoice();
    }, [employee, persistent, resetInviteChoice]);

    // A first day can still be given to someone Active who hasn't worked a shift yet.
    const mayStillStart = Boolean(orgId) && employee.status === "active" && !employee.firstDay;
    useEffect(() => {
      if (!mayStillStart || !orgId) {
        setHasStarted(null);
        return;
      }
      let cancelled = false;
      fetchEmployeeHasStarted(orgId, employee.id)
        .then((started) => {
          if (!cancelled) setHasStarted(started);
        })
        .catch(() => {
          if (!cancelled) setHasStarted(true);
        });
      return () => {
        cancelled = true;
      };
    }, [mayStillStart, orgId, employee.id]);

    const isModified = useMemo(() => {
      return (
        (form.firstName || "") !== (employee.firstName || "") ||
        (form.lastName || "") !== (employee.lastName || "") ||
        form.employmentType !== (employee.employmentType ?? "full_time") ||
        form.certificationId !== employee.certificationId ||
        (form.phone || "") !== (employee.phone || "") ||
        (form.email || "") !== (employee.email || "") ||
        (form.contactNotes || "") !== (employee.contactNotes || "") ||
        form.firstDay !== (employee.firstDay ?? "") ||
        form.focusAreaIds.length !== employee.focusAreaIds.length ||
        form.focusAreaIds.some((id) => !employee.focusAreaIds.includes(id)) ||
        form.roleIds.length !== employee.roleIds.length ||
        form.roleIds.some((id) => !employee.roleIds.includes(id)) ||
        form.departmentIds.length !== employee.departmentIds.length ||
        form.departmentIds.some((id) => !employee.departmentIds.includes(id))
      );
    }, [form, employee]);

    const isSaveBlocked = useMemo(
      () =>
        Boolean(
          !form.firstName.trim() ||
          !form.lastName.trim() ||
          (form.focusAreaIds.length === 0 && !isManagementUser) ||
          validateRequired(form.firstName, "First name") ||
          validateRequired(form.lastName, "Last name") ||
          validateStaffEmail(form.email) ||
          validatePhone(form.phone) ||
          validateNotes(form.contactNotes) ||
          emailConflict ||
          phoneConflict,
        ),
      [form, isManagementUser, emailConflict, phoneConflict, validateStaffEmail],
    );

    useEffect(() => {
      onSaveBlockedChange?.(isSaveBlocked);
    }, [isSaveBlocked, onSaveBlockedChange]);

    const inviteOption =
      inviteOnSave && !hideIdentityFields && !emailConflict
        ? describeInviteOnSave({
            hasAccount: Boolean(employee.userId),
            savedEmail: employee.email || "",
            typedEmail: form.email,
            pendingInvitationEmail: pendingInvitation?.email ?? null,
            canInvite: inviteOnSave.canInvite,
            inSandbox: isInSandbox,
          })
        : null;
    const sendingInvite = Boolean(inviteOption && (inviteTicked ?? inviteOption.defaultChecked));
    // Only an invite renames the host's save button; otherwise each host keeps its own wording.
    const saveLabel = sendingInvite ? INVITE_ON_SAVE_BUTTON_LABEL : undefined;

    // Ticking the invite on an unchanged record is still something to save.
    const hasSomethingToSave = isModified || sendingInvite;

    useEffect(() => {
      onDirtyChange?.(hasSomethingToSave);
    }, [hasSomethingToSave, onDirtyChange]);

    useEffect(() => {
      onSaveLabelChange?.(saveLabel);
    }, [saveLabel, onSaveLabelChange]);

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
        validateStaffEmail(form.email) ||
        validatePhone(form.phone) ||
        validateNotes(form.contactNotes) ||
        emailConflict ||
        phoneConflict
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
        firstDay: form.firstDay || null,
      };

      const invite: InviteOnSaveChoice | null =
        inviteOnSave && inviteOption && sendingInvite
          ? inviteOption.kind === "reinvite" && pendingInvitation
            ? { kind: "reinvite", replacing: pendingInvitation }
            : {
                kind: "invite",
                role: inviteRole,
                ...(inviteOnSave.canSetAdminPermissions &&
                inviteRole === "admin" &&
                invitePermissions
                  ? { adminPermissions: invitePermissions }
                  : {}),
              }
          : null;

      const saved =
        (await (invite && inviteOnSave
          ? inviteOnSave.onSaveAndInvite(nextEmployee, invite, stepUpRef.current.run)
          : onSave(nextEmployee))) !== false;
      if (!saved) return false;
      onSaveCompleted?.();
      return true;
    }, [
      form,
      employee,
      onSave,
      onSaveCompleted,
      pendingInvitation,
      stepUpRef,
      validateStaffEmail,
      isManagementUser,
      emailConflict,
      phoneConflict,
      inviteOnSave,
      inviteOption,
      sendingInvite,
      inviteRole,
      invitePermissions,
    ]);

    const handleDismiss = useCallback(() => {
      if (isModified) {
        setForm(buildEditForm(employee));
        setTouched({});
        resetInviteChoice();
        return;
      }

      onCancel();
    }, [employee, isModified, onCancel, resetInviteChoice]);

    useImperativeHandle(
      ref,
      () => ({
        save: handleSave,
        requestDismiss: handleDismiss,
        focusEmail: () => emailInputRef.current?.focus(),
      }),
      [handleSave, handleDismiss],
    );

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

    // Only someone with management access can come off the schedule. For anyone
    // else the focus areas are the whole staff record, so an empty set is the
    // required-field error on the field itself rather than a consequence.
    const assignmentNotices = useMemo(() => {
      const notices: string[] = [];
      if (isManagementUser && form.focusAreaIds.length === 0) {
        notices.push(
          "Saving now removes them from the schedule. They'll stay on their administrative teams.",
        );
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
    // Flush inside a card's side padding, the footer reaches out to the card's edges.
    const footerSidePadding = flushHorizontal ? "var(--dg-card-padding-x)" : sidePadding;

    return (
      <>
        <div
          style={{
            padding: isMobile ? `16px ${sidePadding} 0` : `0 ${sidePadding}`,
          }}
        >
          {/* A removed employee's record is read-only, not disabled: every field
              below already carries its own `readOnly`/`disabled`, so dimming the
              whole card only made the record look broken and blocked selecting
              text out of it. */}
          {/* Sectioned, Details and Work share one card: one save covers both. */}
          <div
            className={sectioned ? "dg-card" : undefined}
            style={{ display: "flex", flexDirection: "column" }}
          >
            {/* ── Details section ── */}
            <div
              style={
                sectioned
                  ? undefined
                  : { paddingTop: hideIdentityFields ? 0 : 20, paddingBottom: 20 }
              }
            >
              {sectioned ? (
                <div className="dg-card-header">
                  <div className="dg-card-title">Details</div>
                </div>
              ) : hideIdentityFields ? null : (
                <div className="dg-type-content-group-heading" style={{ marginBottom: 8 }}>
                  Details
                </div>
              )}
              <div
                className={sectioned ? "dg-card-body" : undefined}
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
              >
                {!hideIdentityFields && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label htmlFor={`${identityFieldIdPrefix}-first-name`} style={fieldLabel}>
                        First name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                      </label>
                      <input
                        id={`${identityFieldIdPrefix}-first-name`}
                        name="staff-first-name"
                        autoComplete="section-staff-editor given-name"
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
                      <label htmlFor={`${identityFieldIdPrefix}-last-name`} style={fieldLabel}>
                        Last name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                      </label>
                      <input
                        id={`${identityFieldIdPrefix}-last-name`}
                        name="staff-last-name"
                        autoComplete="section-staff-editor family-name"
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
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                      gap: 10,
                      alignItems: "start",
                    }}
                  >
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
                        style={{ width: "100%" }}
                      />
                    </div>
                    {/* Here only while it's ahead, or for someone who hasn't worked a shift yet. */}
                    {upcomingFirstDay(employee, formatDateKey(new Date())) ||
                    (mayStillStart && hasStarted === false && !readOnly) ? (
                      <FirstDayField
                        value={form.firstDay}
                        onChange={(firstDay) => setForm((p) => ({ ...p, firstDay }))}
                        labelStyle={fieldLabel}
                        labelGap={4}
                        disabled={readOnly}
                        placeholder="Set first day"
                      />
                    ) : null}
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
                      <label htmlFor={`${identityFieldIdPrefix}-phone`} style={fieldLabel}>
                        Phone
                      </label>
                      <input
                        id={`${identityFieldIdPrefix}-phone`}
                        name="staff-phone"
                        autoComplete="section-staff-editor tel"
                        className="dg-input"
                        type="tel"
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
                      {!fieldErrors.phone && phoneConflict && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                            marginTop: 4,
                          }}
                          role="alert"
                        >
                          {PHONE_BELONGS_TO_SOMEONE_ELSE}
                        </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor={`${identityFieldIdPrefix}-email`} style={fieldLabel}>
                        Email
                      </label>
                      <input
                        ref={emailInputRef}
                        id={`${identityFieldIdPrefix}-email`}
                        name="staff-email"
                        autoComplete="section-staff-editor email"
                        className="dg-input"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                        onBlur={() => markTouched("email")}
                        placeholder="name@example.com"
                        readOnly={readOnly || Boolean(employee.userId)}
                        style={{
                          ...(fieldErrors.email
                            ? { borderColor: "var(--dg-color-danger)" }
                            : undefined),
                          ...(employee.userId
                            ? { color: "var(--dg-color-text-muted)", cursor: "default" }
                            : undefined),
                        }}
                      />
                      {employee.userId && !fieldErrors.email && (
                        <div
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-text-subtle)",
                            marginTop: 4,
                          }}
                        >
                          This is their sign-in email, so they change it on their own profile.
                          {onMoveToNewEmail ? (
                            <span className="block">
                              Lost access to this email?{" "}
                              <button
                                type="button"
                                onClick={onMoveToNewEmail}
                                className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[var(--dg-color-link)] hover:underline"
                              >
                                Move them to a new one
                              </button>
                            </span>
                          ) : null}
                        </div>
                      )}
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
                          {EMAIL_BELONGS_TO_SOMEONE_ELSE}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {inviteOption && inviteOnSave ? (
                  <InviteOptionBox
                    label={INVITE_ON_SAVE_LABELS[inviteOption.kind]}
                    checked={sendingInvite}
                    onCheckedChange={setInviteTicked}
                    role={
                      inviteOption.kind === "invite"
                        ? {
                            value: inviteRole,
                            options: inviteOnSave.roleOptions,
                            onChange: setInviteRole,
                          }
                        : undefined
                    }
                    permissions={
                      inviteOption.kind === "invite" &&
                      inviteOnSave.canSetAdminPermissions &&
                      inviteRole === "admin"
                        ? { value: invitePermissions, onChange: setInvitePermissions }
                        : undefined
                    }
                    note={describeInviteOnSaveNote(
                      inviteOption.kind,
                      sendingInvite,
                      pendingInvitation?.email ?? "",
                    )}
                    disabled={readOnly}
                  />
                ) : null}

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
                style={
                  sectioned
                    ? undefined
                    : {
                        borderTop: "1px solid var(--dg-color-border-light)",
                        paddingTop: 20,
                        paddingBottom: 20,
                      }
                }
              >
                {sectioned ? (
                  <div
                    className="dg-card-header"
                    style={{ borderTop: "1px solid var(--dg-color-border-light)" }}
                  >
                    <div className="dg-card-title">Work</div>
                  </div>
                ) : hideIdentityFields ? null : (
                  <div className="dg-type-content-group-heading" style={{ marginBottom: 8 }}>
                    Assignments
                  </div>
                )}
                <div
                  className={sectioned ? "dg-card-body" : undefined}
                  style={{ display: "flex", flexDirection: "column", gap: 16 }}
                >
                  <SectionNotice messages={assignmentNotices} />
                  <div>
                    <label style={fieldLabel}>{certificationLabel}</label>
                    <CustomSelect
                      value={form.certificationId != null ? String(form.certificationId) : ""}
                      options={[
                        { value: "", label: "None" },
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
                    onReinvite={onResend ? () => onResend(pendingInvitation.id) : undefined}
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
                    Send invitation
                  </Button>
                ) : null}
              </div>
            )}

          {/* ── Actions ── */}
          {!hideActions && (
            <div
              className="dg-footer-bar"
              style={
                {
                  "--dg-footer-bar-px": footerSidePadding,
                  margin: `0 calc(-1 * ${footerSidePadding})`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                } as React.CSSProperties
              }
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
                      disabled={!hasSomethingToSave || isSaveBlocked}
                      className="dg-btn dg-btn-primary"
                    >
                      {saveLabel ?? EDITOR_ACTION_LABELS.save}
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
        {stepUp.dialog}
      </>
    );
  },
);

export default EditEmployeePanel;
