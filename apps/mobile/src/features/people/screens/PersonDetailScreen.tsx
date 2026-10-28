import { useEffect, useMemo, useState } from "react";
import { ConfirmSummaryBox } from "../../../shared/components/ConfirmSummaryBox";
import {
  AWAY_ABSENCE_NEEDS_DATE_MESSAGE,
  describeStatusAction,
  statusChoices,
  type StatusAction,
} from "@dubgrid/domain";
import {
  Linking,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Text } from "../../../shared/components/Text";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapResponse,
  MobileBootstrapRole,
  MobileFocusArea,
  MobileNamedItem,
  MobilePerson,
  MobilePersonUpdateBody,
} from "@dubgrid/contracts";
import {
  getOptionalStaffEmailError,
  getStaffNameError,
  getStaffNotesError,
  getOptionalUsPhoneError,
  normalizeOptionalStaffEmail,
  normalizeOptionalUsPhone,
  normalizeStaffName,
  normalizeStaffNotes,
} from "@dubgrid/contracts";
import { getMobileEditorDismissLabel } from "@dubgrid/design-tokens";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import {
  BottomSheetModal,
  SheetHeader,
  SheetActions,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { InlineError } from "../../../shared/components/InlineError";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { SelectionRow, SelectionSection } from "../../../shared/components/FilterSheet";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { createHeaderTextAction } from "../../../shared/navigation/HeaderTextAction";
import {
  changeMobilePersonOrgRole,
  checkMobilePersonContact,
  createMobilePersonInvitation,
  getMobilePerson,
  parseMobileAccountLinkChallenge,
  parseMobileContactConflict,
  parseMobileStaffFieldErrors,
  resendMobilePersonInvitation,
  revokeMobilePersonInvitation,
  requireMobileCredentialAssurance,
  updateMobilePerson,
  updateMobilePersonStatus,
  type MobileAccountLinkChallenge,
  type MobileStaffField,
} from "../../../shared/lib/api";
import { getAvatarTone, resolveAvatarSeed } from "../../../shared/lib/avatar-tone";
import { addDaysToIsoDate, getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import { ReturnDateField } from "../components/ReturnDatePicker";
import {
  getDepartmentNames,
  getScheduledDepartmentNames,
  MANAGEMENT_DEPARTMENT_LABELS,
} from "../../../shared/lib/departments";
import {
  getClientFriendlyErrorMessage,
  pushClientFriendlyErrorToast,
} from "../../../shared/lib/errors";
import { singularLabelNoun } from "../../../shared/lib/labels";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useModalHandoff } from "../../../shared/hooks/useModalHandoff";
import { useNavigationDiscardGuard } from "../../../shared/hooks/useNavigationDiscardGuard";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  getProfileInitials,
  ProfileChoiceGroup,
  ProfileHero,
  ProfileInfoRow,
  ProfileList,
  ProfileNavRow,
  ProfileActionStack,
  ProfilePanel,
  ProfileQuickAction,
  ProfileQuickActions,
  ProfileSection,
  ProfileTextInput,
} from "../../profile/components/ProfilePrimitives";
import { useMobileStepUpAction } from "../../profile/hooks/useMobileStepUpAction";
import { isRoleCertificationBlocked } from "../../profile/lib/role-certification";
import { ProfileSkeleton } from "../../profile/components/ProfileSkeleton";
import { EMAIL_CONFLICT_MESSAGES, PHONE_CONFLICT_MESSAGE } from "../lib/contactConflicts";
import { hasManagementAccess } from "../lib/managementAccess";
import { ORG_ROLE_LABELS } from "../lib/orgRoleBadges";
import { SectionNotice } from "../components/SectionNotice";
import {
  STATUS_KIND_ICONS,
  STATUS_KIND_TONES,
  StatusCards,
  StatusIconCircle,
  StatusMarkIcon,
  type StatusSheetOpening,
} from "../components/StatusMark";
import { ManagementAccessSheet } from "../components/ManagementAccessSheet";
import {
  getPersonOrgRole,
  getPersonOrgRoleSubject,
  OrgRoleSheet,
  type OrgRole,
} from "../components/OrgRoleSheet";

/** The one Change status sheet (51d), or nothing open. */
type ConfirmAction = "status" | null;
type StatusMutationAction =
  | "deactivate"
  | "activate"
  | "remove"
  | "setReturnDate"
  | "reinstate"
  | "suspend"
  | "setPlannedChange"
  | "cancelPlannedChange";

/** The request each choice in the Change status sheet sends. */
const STATUS_REQUEST: Record<StatusAction, StatusMutationAction> = {
  markAway: "deactivate",
  archive: "remove",
  markActive: "activate",
  restore: "activate",
  reinstate: "reinstate",
  suspend: "suspend",
  setReturnDate: "setReturnDate",
  setPlannedChange: "setPlannedChange",
  cancelPlannedChange: "cancelPlannedChange",
};
type InvitationConfirmAction = "create" | "resend" | "revoke" | null;

/** Draft fields the server can reject on its own, so a rejection can be retired. */
const SERVER_CHECKED_FIELDS = ["firstName", "lastName", "email", "phone"] as const;
const LINKED_EMAIL_REQUIRED_MESSAGE = "An account needs an email to sign in with.";

type EditDraft = {
  firstName: string;
  lastName: string;
  employmentType: MobilePerson["employmentType"];
  phone: string;
  email: string;
  contactNotes: string;
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  departmentIds: number[];
};

function getFullName(person: MobilePerson): string {
  return `${person.firstName} ${person.lastName}`.trim() || person.email || "Unnamed person";
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function makeDraft(person: MobilePerson): EditDraft {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    employmentType: person.employmentType,
    phone: person.phone,
    email: person.email,
    contactNotes: person.contactNotes,
    certificationId: person.certificationId,
    focusAreaIds: person.focusAreaIds,
    roleIds: person.roleIds,
    departmentIds: person.departmentIds,
  };
}

/**
 * Whether the draft differs from the saved person.
 *
 * Module scope, and used by both the edit panel's buttons and the screen's
 * unsaved-changes guard. While this lived inside the panel the screen couldn't
 * see it, so back navigation had no idea there was anything to lose; computing
 * it twice would be worse still, because then Cancel and the back button could
 * disagree about whether to ask.
 */
function personDraftHasChanges(draft: EditDraft, person: MobilePerson): boolean {
  const saved = makeDraft(person);

  return (
    draft.firstName.trim() !== saved.firstName ||
    draft.lastName.trim() !== saved.lastName ||
    draft.employmentType !== saved.employmentType ||
    draft.phone.trim() !== saved.phone ||
    draft.email.trim() !== saved.email ||
    draft.contactNotes !== saved.contactNotes ||
    draft.certificationId !== saved.certificationId ||
    !sameIds(draft.focusAreaIds, saved.focusAreaIds) ||
    !sameIds(draft.roleIds, saved.roleIds) ||
    !sameIds(draft.departmentIds, saved.departmentIds)
  );
}

/**
 * Field-level validation for the edit form.
 *
 * Module scope, same reasoning as `personDraftHasChanges` above: the footer
 * Save button's `disabled` state and the panel's inline per-field errors both
 * need this, and computing it twice by hand risks the two disagreeing about
 * whether the draft is actually valid.
 *
 * The format rule wins over the duplicate verdict where both apply: a
 * malformed address was never checked for uniqueness, and saying it is taken
 * would be describing something that wasn't asked.
 */
// The staff email is the login email, so a linked account cannot be left without one.
function getStaffEmailError(value: string, hasAccount: boolean) {
  return hasAccount && !value.trim()
    ? LINKED_EMAIL_REQUIRED_MESSAGE
    : getOptionalStaffEmailError(value);
}

function getPersonEditFieldErrors(
  draft: EditDraft,
  serverFieldErrors: Partial<Record<MobileStaffField, string>>,
  hasManagementAccess: boolean,
  focusAreaLabel: string,
  hasAccount = false,
) {
  return {
    firstName: getStaffNameError(draft.firstName, "First name") ?? serverFieldErrors.firstName,
    lastName: getStaffNameError(draft.lastName, "Last name") ?? serverFieldErrors.lastName,
    phone: getOptionalUsPhoneError(draft.phone) ?? serverFieldErrors.phone,
    email: getStaffEmailError(draft.email, hasAccount) ?? serverFieldErrors.email,
    contactNotes: getStaffNotesError(draft.contactNotes),
    focusAreaIds:
      draft.focusAreaIds.length === 0 && !hasManagementAccess
        ? `Select at least one ${singularLabelNoun(focusAreaLabel)}`
        : null,
  };
}

export default function PersonDetailScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isDark = useIsDarkMode();
  const params = useLocalSearchParams<{ id?: string }>();
  const personId = Array.isArray(params.id) ? params.id[0] : params.id;
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  // Employee numbers are an employee-details fact, not a directory one: web
  // keeps its ID column and staff detail page behind the same permission.
  // Managing employees implies viewing their details (authz applies that
  // implication server-side); restated here so a bootstrap that carries only
  // the manage flag still reads as a staff manager.
  const canViewEmployeeDetails = Boolean(
    bootstrapQuery.data?.permissions.canViewEmployeeDetails ||
    bootstrapQuery.data?.permissions.canManageEmployees,
  );
  // A person's own employee record belongs to the Profile tab. Resolve that
  // from bootstrap before enabling this query so a pasted /person/[id] URL
  // cannot briefly fetch and render the duplicate teammate-profile surface.
  const currentEmployeeId = bootstrapQuery.data?.linkedEmployee?.id ?? null;
  const isSelfRoute = Boolean(personId && currentEmployeeId && personId === currentEmployeeId);
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  /** The person the draft was last built from, so the sync below runs once. */
  const [draftSource, setDraftSource] = useState<MobilePerson | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [invitationConfirmAction, setInvitationConfirmAction] =
    useState<InvitationConfirmAction>(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const handoffInvitation = useModalHandoff();
  // Shared by the active editor or status task; only the visible surface renders it.
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [managementAccessError, setManagementAccessError] = useState<string | null>(null);
  const [inactiveNote, setInactiveNote] = useState("");
  const [statusChoice, setStatusChoice] = useState<StatusAction | null>(null);
  const [statusOpening, setStatusOpening] = useState<StatusSheetOpening>({});
  // The choice the sheet opened with (Reinstate, Restore): picked for them, not an edit.
  const [openedChoice, setOpenedChoice] = useState<StatusAction | null>(null);
  const [returnDate, setReturnDate] = useState<string | null>(null);
  /** The first day away; null means today, and a later day plans it (51g1). */
  const [startDate, setStartDate] = useState<string | null>(null);
  const [cancellingPlan, setCancellingPlan] = useState(false);
  // The absence a return date's away days hold (51f); it goes when the date does.
  const [awayAbsenceTypeId, setAwayAbsenceTypeId] = useState<number | null>(null);
  const [accountLinkChallenge, setAccountLinkChallenge] =
    useState<MobileAccountLinkChallenge | null>(null);
  const [showOrgRole, setShowOrgRole] = useState(false);
  const [showManagementAccess, setShowManagementAccess] = useState(false);
  const [orgRoleError, setOrgRoleError] = useState<string | null>(null);
  /**
   * Field errors the server found, kept apart from the ones this screen can work
   * out itself. A duplicate email or phone is only knowable server-side, and
   * without somewhere to put the answer it landed in a toast while the offending
   * input stayed unmarked and Save stayed live to fail the same way again.
   */
  const [serverFieldErrors, setServerFieldErrors] = useState<
    Partial<Record<MobileStaffField, string>>
  >({});
  const [isCompactTitleVisible, setIsCompactTitleVisible] = useState(false);

  const personQuery = useQuery({
    queryKey: mobileQueryKeys.person(accessToken, personId),
    queryFn: ({ signal }) => getMobilePerson(accessToken!, personId!, signal),
    enabled: Boolean(accessToken && personId && bootstrapQuery.data && !isSelfRoute),
  });
  const manualRefresh = useManualRefresh(() =>
    Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]),
  );
  // Super-admin/gridmaster only, the same bar web holds management access
  // behind — it is not one of the admin permissions.
  const canManageManagementAccess = Boolean(
    bootstrapQuery.data?.permissions.canManageManagementAccess,
  );
  const currentUserId = bootstrapQuery.data?.user?.id ?? null;
  const rawPerson = personQuery.data?.person ?? null;
  const person =
    rawPerson && (canManageEmployees || rawPerson.status === "active") ? rawPerson : null;
  const isSelf =
    isSelfRoute || Boolean(currentUserId && person?.userId && person.userId === currentUserId);
  const canEdit = canManageEmployees && person?.status !== "removed";
  const contentState = useMobileContentState({
    // Bootstrap belongs in both halves, not just `isLoading`. `person` above is
    // gated on `canManageEmployees`, which comes from bootstrap: with only the
    // person query resolved, an inactive teammate reads as null and the screen
    // renders "Person not found" until bootstrap lands and corrects it.
    hasData: personQuery.data !== undefined && bootstrapQuery.data !== undefined,
    isLoading: personQuery.isLoading || bootstrapQuery.isLoading,
    error: personQuery.error ?? bootstrapQuery.error,
  });

  useEffect(() => {
    if (isSelf) {
      router.replace("/(tabs)/profile");
    }
  }, [isSelf]);

  // Only what actually changed and is worth asking about: an untouched field
  // can't have become a duplicate, and a malformed one has a format error to
  // show already.
  const draftEmail = draft?.email.trim() ?? "";
  const draftPhone = draft?.phone.trim() ?? "";
  const emailToCheck =
    editing && draftEmail && draftEmail !== person?.email && !getOptionalStaffEmailError(draftEmail)
      ? draftEmail
      : "";
  const phoneToCheck =
    editing && draftPhone && draftPhone !== person?.phone && !getOptionalUsPhoneError(draftPhone)
      ? draftPhone
      : "";

  // Web debounces the same pre-flight at 400ms, and soft-fails it: a flaky
  // check must never be the thing that stops a legitimate save, since the 409
  // on submit is still there as the real gate.
  useEffect(() => {
    if (!accessToken || !person || (!emailToCheck && !phoneToCheck)) {
      setServerFieldErrors((current) =>
        current.email || current.phone
          ? { ...current, email: undefined, phone: undefined }
          : current,
      );
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void checkMobilePersonContact(accessToken, {
        email: emailToCheck || undefined,
        phone: phoneToCheck || undefined,
        excludeEmployeeId: person.id,
        currentUserId: person.userId,
      })
        .then((result) => {
          if (cancelled) return;
          setServerFieldErrors((current) => ({
            ...current,
            email: result.email?.conflict
              ? EMAIL_CONFLICT_MESSAGES[result.email.reason ?? "employee_duplicate"]
              : undefined,
            phone: result.phone?.conflict ? PHONE_CONFLICT_MESSAGE : undefined,
          }));
        })
        .catch(() => {
          if (cancelled) return;
          setServerFieldErrors((current) => ({ ...current, email: undefined, phone: undefined }));
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken, emailToCheck, phoneToCheck, person]);

  // Adjusted during render, not in an effect. An effect runs *after* the
  // browser paints, so on the frame where `person` first arrived the draft was
  // still null and the screen below rendered "Person not found" before
  // correcting itself — a flash on every single load. Setting state during
  // render makes React discard this pass and re-run immediately, before
  // anything reaches the screen.
  //
  // Only keys off the person's identity: every path that leaves `editing`
  // (save, cancel, discard) already rebuilds the draft itself, so there is
  // nothing to re-sync on that transition.
  if (person && !editing && person !== draftSource) {
    setDraftSource(person);
    setDraft(makeDraft(person));
    setInactiveNote(person.statusNote);
  }

  const maps = useMemo(() => buildLookupMaps(bootstrapQuery.data), [bootstrapQuery.data]);
  const useCompactRoleCertificationLabels =
    bootstrapQuery.data?.currentOrg?.useCompactRoleCertificationLabels ?? false;
  // Declared up here rather than with the other labels below because
  // `handleSave` names it in a validation message.
  const focusAreaLabel = bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Areas";

  function updateCachedPerson(nextPerson: MobilePerson) {
    queryClient.setQueryData(mobileQueryKeys.person(accessToken, nextPerson.id), {
      person: nextPerson,
    });
    queryClient.setQueryData(
      mobileQueryKeys.people(accessToken),
      (current: { people: MobilePerson[] } | undefined) =>
        current
          ? {
              people: current.people.map((item) => (item.id === nextPerson.id ? nextPerson : item)),
            }
          : current,
    );
  }

  const stepUp = useMobileStepUpAction();
  const updateMutation = useMutation({
    mutationFn: async ({
      actionAccessToken,
      ...body
    }: MobilePersonUpdateBody & { actionAccessToken?: string }) =>
      updateMobilePerson(actionAccessToken ?? accessToken!, personId!, body),
    onMutate: () => setConfirmationError(null),
    onError: (error) => {
      // A rejection the server pinned to a field belongs on that field, not in
      // a banner: the confirmation closes, the input goes red, and Save stays
      // disabled until it changes.
      const conflict = parseMobileContactConflict(error);
      const fieldErrors = conflict
        ? { [conflict.field]: conflict.message }
        : parseMobileStaffFieldErrors(error);
      if (fieldErrors) {
        setServerFieldErrors((current) => ({ ...current, ...fieldErrors }));
        setShowSaveConfirmation(false);
        pushToast({
          tone: "warning",
          title: "Check the highlighted field",
          message: Object.values(fieldErrors)[0] ?? "Some details need another look.",
        });
        return;
      }
      setConfirmationError(
        getClientFriendlyErrorMessage(error, "We couldn't save those staff details right now."),
      );
    },
    onSuccess: async (result) => {
      setShowSaveConfirmation(false);
      updateCachedPerson(result.person);
      setEditing(false);
      setServerFieldErrors({});
      setDraft(makeDraft(result.person));
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      pushToast({
        tone: "success",
        title: "Person saved",
        message: "Staff details were updated.",
      });
    },
  });
  const statusMutation = useMutation({
    mutationFn: async (input: {
      action: StatusMutationAction;
      /** Names the done toast: Restored rather than Marked active. */
      copyAction: StatusAction;
      note?: string;
      returnDate?: string | null;
      absenceTypeId?: number | null;
      startDate?: string | null;
      expectedVersion: number;
      fromReturnDate: string | null;
    }) =>
      updateMobilePersonStatus(accessToken!, personId!, {
        action: input.action,
        expectedVersion: input.expectedVersion,
        note: input.note,
        ...(input.returnDate !== undefined ? { returnDate: input.returnDate } : {}),
        ...(input.absenceTypeId !== undefined ? { absenceTypeId: input.absenceTypeId } : {}),
        ...(input.startDate ? { startDate: input.startDate } : {}),
      }),
    onMutate: () => setConfirmationError(null),
    onError: (error) => {
      setConfirmationError(
        getClientFriendlyErrorMessage(error, "We couldn't update that teammate right now."),
      );
    },
    onSuccess: async (result, variables) => {
      updateCachedPerson(result.person);
      setConfirmAction(null);
      setStatusChoice(null);
      setInactiveNote("");
      setReturnDate(null);
      setAwayAbsenceTypeId(null);
      setStartDate(null);
      setCancellingPlan(false);
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      pushToast({
        tone: "success",
        title: describeStatusAction(variables.copyAction, getFullName(result.person), {
          returnDate: variables.returnDate ?? null,
          currentReturnDate: variables.fromReturnDate,
          startDate: variables.startDate ?? null,
        }).done,
        message: "Staff status was updated.",
      });
    },
  });
  const invitationMutation = useMutation({
    onMutate: () => setInvitationError(null),
    mutationFn: async (input: {
      action: "create" | "resend" | "revoke";
      linkExistingAccount?: boolean;
      reconcileName?: boolean;
    }) => {
      if (!person) throw new Error("Person unavailable");
      if (input.action === "create") {
        return createMobilePersonInvitation(accessToken!, person.id, {
          email: person.email,
          linkExistingAccount: input.linkExistingAccount,
          reconcileName: input.reconcileName,
        });
      }
      if (!person.pendingInvitation) {
        throw new Error("Invitation unavailable");
      }
      const body = {
        invitationId: person.pendingInvitation.id,
        expectedUpdatedAt: person.pendingInvitation.updatedAt,
      };
      return input.action === "resend"
        ? resendMobilePersonInvitation(accessToken!, person.id, body)
        : revokeMobilePersonInvitation(accessToken!, person.id, body);
    },
    onError: (error) => {
      const challenge = parseMobileAccountLinkChallenge(error);
      if (challenge) {
        setInvitationConfirmAction(null);
        handoffInvitation(() => setAccountLinkChallenge(challenge));
        return;
      }
      setInvitationError(
        getClientFriendlyErrorMessage(error, "We couldn't update that invitation right now."),
      );
      // A failed send restores the previous link, which changes the row's
      // version, so refetch before the next attempt checks it.
      void personQuery.refetch();
    },
    onSuccess: async (result, variables) => {
      updateCachedPerson(result.person);
      setAccountLinkChallenge(null);
      setInvitationConfirmAction(null);
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      const title =
        result.result === "account_linked"
          ? "Account linked"
          : variables.action === "create"
            ? "Invitation sent"
            : variables.action === "resend"
              ? "Invitation resent"
              : "Invitation revoked";
      const message =
        result.result === "account_linked"
          ? "Existing app access was linked to this staff profile."
          : "Staff access was updated.";
      pushToast({
        tone: "success",
        title,
        message,
      });
    },
  });

  const orgRoleMutation = useMutation({
    mutationFn: async (orgRole: OrgRole) => {
      if (!person) throw new Error("Person unavailable");
      return changeMobilePersonOrgRole(accessToken!, person.id, {
        orgRole,
        expectedMembershipUpdatedAt: person.membershipUpdatedAt,
        expectedInvitationUpdatedAt: person.pendingInvitation?.updatedAt ?? null,
      });
    },
    onMutate: () => setOrgRoleError(null),
    onError: (error) => {
      setOrgRoleError(
        getClientFriendlyErrorMessage(error, "We couldn't change that role right now."),
      );
    },
    onSuccess: async (result) => {
      updateCachedPerson(result.person);
      setShowOrgRole(false);
      await Promise.all([personQuery.refetch(), bootstrapQuery.refetch()]);
      if (result.result === "unchanged") return;
      pushToast({
        tone: "success",
        title: result.result === "invitation_replaced" ? "Invitation replaced" : "Role updated",
        message:
          result.result === "invitation_replaced"
            ? "A replacement invitation is on its way."
            : "Their access updates immediately.",
      });
    },
  });

  const hasChanges = Boolean(draft && person && personDraftHasChanges(draft, person));
  // `editing && hasChanges`, not just `editing`: on iOS the whole screen is a
  // back-swipe target, so a guard that fired for an untouched open panel would
  // put a confirmation in front of an ordinary swipe back.
  const guard = useUnsavedChangesGuard({
    isDirty: editing && hasChanges,
    disabled: updateMutation.isPending,
    onDiscard: () => {
      if (person) setDraft(makeDraft(person));
    },
    onClose: () => setEditing(false),
  });
  // Header back, Android hardware back and the iOS back swipe ask too, through
  // this same confirmation rather than a second one of their own.
  useNavigationDiscardGuard(guard);
  const plannedAway =
    person?.status === "active" && person.plannedStatus === "away" && !!person.plannedFrom;
  const statusGuard = useUnsavedChangesGuard({
    isDirty:
      confirmAction === "status" &&
      (statusChoice !== openedChoice ||
        Boolean(inactiveNote.trim()) ||
        returnDate !==
          (person?.status === "inactive"
            ? (person.awayUntil ?? null)
            : plannedAway
              ? (person.plannedUntil ?? null)
              : null) ||
        awayAbsenceTypeId !==
          (person?.status === "inactive"
            ? (person.awayAbsenceTypeId ?? null)
            : plannedAway
              ? (person.plannedAbsenceTypeId ?? null)
              : null) ||
        startDate !== (plannedAway ? (person.plannedFrom ?? null) : null)),
    disabled: statusMutation.isPending,
    onClose: closeStatusConfirmation,
  });

  function handleSave() {
    if (!person || !draft) return;
    const firstNameError = getStaffNameError(draft.firstName, "First name");
    const lastNameError = getStaffNameError(draft.lastName, "Last name");
    const emailError = getStaffEmailError(draft.email, Boolean(person.userId));
    const phoneError = getOptionalUsPhoneError(draft.phone);
    const notesError = getStaffNotesError(draft.contactNotes);
    // Someone with management access doesn't need at least one focus area to
    // fall back on — they can come off the schedule entirely and keep managing.
    const hasManagementAccess = person.managementDepartmentIds.length > 0;
    // A conflict the server already told us about counts here too, or Save
    // would keep reopening the confirmation to fail on the same duplicate.
    const serverError = Object.values(serverFieldErrors).find(Boolean) ?? null;
    if (
      firstNameError ||
      lastNameError ||
      emailError ||
      phoneError ||
      notesError ||
      serverError ||
      (draft.focusAreaIds.length === 0 && !hasManagementAccess)
    ) {
      pushToast({
        title: "Check required fields",
        message:
          firstNameError ??
          lastNameError ??
          emailError ??
          phoneError ??
          notesError ??
          serverError ??
          `Select at least one ${singularLabelNoun(focusAreaLabel)}.`,
        tone: "warning",
      });
      return;
    }

    // Only the email is worth stopping for. Coming off the schedule is already
    // stated inline, by the notice above the focus areas, so asking again here
    // warned twice for one action.
    const changesAccessEmail = normalizeOptionalStaffEmail(draft.email) !== person.email;
    if (changesAccessEmail) {
      setShowSaveConfirmation(true);
      return;
    }
    return confirmSave();
  }

  async function confirmSave() {
    if (!person || !draft) return;

    // The staff email is the login email. Changing it for a linked account is
    // a sensitive action, so the manager confirms their identity first, the
    // way their own email change does.
    const changesLoginEmail =
      Boolean(person.userId) && normalizeOptionalStaffEmail(draft.email) !== person.email;
    if (changesLoginEmail) {
      try {
        await stepUp.run(async (actionAccessToken) => {
          await requireMobileCredentialAssurance(actionAccessToken);
          await updateMutation.mutateAsync({ ...buildUpdateBody(), actionAccessToken });
        });
      } catch {
        // The mutation owns its user-facing error.
      }
      return;
    }
    return updateMutation.mutateAsync(buildUpdateBody());
  }

  function buildUpdateBody(): MobilePersonUpdateBody {
    return {
      expectedVersion: person!.version,
      firstName: normalizeStaffName(draft!.firstName),
      lastName: normalizeStaffName(draft!.lastName),
      employmentType: draft!.employmentType,
      phone: normalizeOptionalUsPhone(draft!.phone),
      email: normalizeOptionalStaffEmail(draft!.email),
      contactNotes: normalizeStaffNotes(draft!.contactNotes),
      certificationId: draft!.certificationId,
      focusAreaIds: draft!.focusAreaIds,
      roleIds: draft!.roleIds,
      departmentIds: draft!.departmentIds,
    };
  }

  function handlePersonScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // Keep the hero as the identity at rest. Once it begins to pass under the
    // native bar, UIKit's scroll-edge effect takes over and the compact title
    // gives the page a stable identity. A small threshold prevents the title
    // flickering during the scroll view's elastic resting bounce.
    const nextVisible = event.nativeEvent.contentOffset.y > 12;
    setIsCompactTitleVisible((visible) => (visible === nextVisible ? visible : nextVisible));
  }

  if (isSelf) {
    return <Screen bottomPaddingMode="stack" scrollEnabled={false} />;
  }

  if (contentState.kind === "loading") {
    return (
      <Screen
        bottomPaddingMode="stack"
        // A skeleton must not scroll, and there is nothing to pull-to-refresh
        // while the profile is still loading.
        scrollEnabled={false}
      >
        {/* Nothing at all for a blip: a skeleton that appears and vanishes
            inside a few frames reads as a glitch, not as loading. */}
        {/* Drawn for this viewer, not for a manager: the page a colleague gets
            has no contact actions, no Contact list and a Staffing list only
            when a certification exists, so a manager's silhouette promised
            sections that never arrived. Bootstrap is cached from app start,
            so the permissions are known before the person loads; when they
            are not, the smaller page is the safer guess. */}
        {contentState.showSkeleton ? (
          <ProfileSkeleton
            heroAlign="center"
            metaItems={0}
            // The Call and Email pair for anyone shown contact details;
            // nothing when the API redacts them.
            quickActions={canViewEmployeeDetails ? 2 : 0}
            sections={
              canViewEmployeeDetails
                ? // Contact, Staffing, Assignments at their usual row counts.
                  [{ rows: 2 }, { rows: 3 }, { rows: 2 }]
                : // Assignments alone: the department and the focus area.
                  [{ rows: 2 }]
            }
          />
        ) : null}
      </Screen>
    );
  }

  if (contentState.kind === "error") {
    return (
      <Screen
        bottomPaddingMode="stack"
        onRefresh={manualRefresh.refresh}
        refreshing={manualRefresh.isRefreshing}
      >
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load person"
          variant="centered"
          onAction={() => {
            void personQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  if (!person || !draft) {
    return (
      <Screen
        bottomPaddingMode="stack"
        onRefresh={manualRefresh.refresh}
        refreshing={manualRefresh.isRefreshing}
      >
        <EmptyStateCard
          fillScreen
          body="This teammate isn't in your directory anymore."
          iconName="person-outline"
          title="Person not found"
        />
      </Screen>
    );
  }

  const roleLabel = bootstrapQuery.data?.currentOrg.labels.role ?? "Roles";
  const certificationLabel =
    bootstrapQuery.data?.currentOrg.labels.certification ?? "Certification";
  const departmentLabel = bootstrapQuery.data?.currentOrg.labels.department ?? "Departments";
  const managementDepartments = (bootstrapQuery.data?.departments ?? []).filter(
    (department) => department.type === "management",
  );
  const focusAreaNames = formatIdList(person.focusAreaIds, maps.focusAreas);
  const scheduledDepartmentNames = formatNameList(
    getScheduledDepartmentNames(
      person.focusAreaIds,
      bootstrapQuery.data?.focusAreas,
      bootstrapQuery.data?.departments,
    ),
  );
  const roleNames = formatIdList(person.roleIds, maps.roles);
  const managementDepartmentNames = formatNameList(
    getDepartmentNames(person.managementDepartmentIds, bootstrapQuery.data?.departments),
  );
  const certificationName =
    person.certificationId != null
      ? (maps.certifications.get(person.certificationId) ?? "Unknown")
      : "None";
  const employmentLabel = person.employmentType === "part_time" ? "Part-time" : "Full-time";
  const fullName = getFullName(person);
  const isOnSchedule = person.focusAreaIds.length > 0;
  // Inactive only takes someone off the schedule, so a management-only person
  // can only be removed. Same rule web and the server apply.
  // Through the shared resolver so the hero, the editor's row and the picker
  // inside the sheet can't disagree: an invitation's `roleToAssign` is the
  // role until it is accepted, and reading `orgRole` alone showed a pending
  // Admin as "User".
  const orgRole = getPersonOrgRole(person);
  // The editor's Access row is the role control, the way web's Access column
  // is. It only exists where there is something to write to: a membership, or
  // an invitation carrying the role until it is accepted. Someone with neither
  // has no access record at all, so web prints a dash and offers no dropdown;
  // here the row stays out and the banner below the hero says what to do.
  const canChangeOrgRole =
    canManageManagementAccess &&
    !isSelf &&
    person.status !== "removed" &&
    (person.userId ? person.membershipUpdatedAt != null : person.pendingInvitation != null);
  // Only the two states someone might act on get a banner. A person who
  // already has an account needs no announcement that they do, and the body
  // line naming the next move is for the managers who can make it. A viewer
  // without employee details never sees one: the API redacts `userId` and
  // the invitation for them, so every colleague would read "No app access".
  const invitationBanner = !canViewEmployeeDetails
    ? null
    : person.userId
      ? null
      : person.pendingInvitation
        ? {
            title: "Invitation pending",
            body: person.pendingInvitation.email
              ? `Sent to ${person.pendingInvitation.email}.`
              : undefined,
            tone: "warning" as const,
          }
        : {
            title: "No app access",
            body: canManageEmployees ? "Send an invitation to give app access." : undefined,
            tone: "info" as const,
          };
  // A manager reads "None" as a gap to fill; a colleague reads it as noise.
  // The rows that can be empty drop out for viewers without details, and the
  // Staffing section with them when nothing is left in it.
  const showCertificationRow = canViewEmployeeDetails || person.certificationId != null;
  const showRolesRow = canViewEmployeeDetails || person.roleIds.length > 0;
  const showStaffingSection = canViewEmployeeDetails || showCertificationRow;
  const avatarTone = getAvatarTone(resolveAvatarSeed(person), isDark);

  const orgToday = getIsoDateInTimeZone(
    new Date(),
    bootstrapQuery.data?.currentOrg.timezone ?? null,
  );
  // Someone with an Away planned (51g1) edits the plan's dates in the sheet.
  const hasPlan =
    person.status === "active" && person.plannedStatus === "away" && !!person.plannedFrom;
  // A start after today plans the Away rather than starting it.
  const laterStart = startDate && startDate > orgToday ? startDate : null;
  // Clearing a planned away's start date starts it today instead.
  const startsNow = hasPlan && !cancellingPlan && !startDate && statusOpening.focus !== "status";

  function confirmStatusAction(): Promise<void> | undefined {
    if (confirmAction !== "status" || !person) return;
    const choice: StatusAction =
      statusChoice ??
      (startsNow
        ? "markAway"
        : hasPlan
          ? cancellingPlan
            ? "cancelPlannedChange"
            : "setPlannedChange"
          : "setReturnDate");
    const dated =
      choice === "markAway" || choice === "setReturnDate" || choice === "setPlannedChange";
    const input = {
      action: STATUS_REQUEST[choice],
      copyAction: choice,
      expectedVersion: person.version,
      fromReturnDate: person.awayUntil,
      note:
        choice === "markAway" || choice === "archive"
          ? inactiveNote.trim() || undefined
          : undefined,
      returnDate:
        choice === "setReturnDate" || choice === "setPlannedChange"
          ? returnDate
          : dated && returnDate
            ? returnDate
            : undefined,
      absenceTypeId:
        choice === "setReturnDate" || (dated && returnDate) ? chosenAbsenceTypeId : undefined,
      startDate:
        choice === "setPlannedChange" || (choice === "markAway" && laterStart)
          ? laterStart
          : undefined,
    };
    return new Promise<void>((resolve) => {
      statusMutation.mutate(input, { onSettled: () => resolve() });
    });
  }

  function openStatusSheet(opening: StatusSheetOpening = {}) {
    if (!person) return;
    const away = person.status === "inactive";
    const options = statusChoices(person).filter((choice) => choice.action !== opening.exclude);
    setStatusOpening(opening);
    // With one status to move to, or a button that named its change, there is nothing to pick.
    const picked =
      opening.only ?? (options.length === 1 && !opening.exclude ? options[0].action : null);
    setStatusChoice(picked);
    setOpenedChoice(picked);
    setInactiveNote("");
    setReturnDate(
      away ? (person.awayUntil ?? null) : hasPlan ? (person.plannedUntil ?? null) : null,
    );
    setAwayAbsenceTypeId(
      away
        ? (person.awayAbsenceTypeId ?? null)
        : hasPlan
          ? (person.plannedAbsenceTypeId ?? null)
          : null,
    );
    setStartDate(hasPlan ? (person.plannedFrom ?? null) : null);
    setCancellingPlan(false);
    setConfirmationError(null);
    setConfirmAction("status");
  }

  function closeStatusConfirmation() {
    setConfirmAction(null);
    setStatusChoice(null);
    setConfirmationError(null);
    // The note is typed inside this modal and never survives it, so clearing it
    // here stops the next status change opening with the last one's reason.
    setInactiveNote("");
    setReturnDate(null);
    setAwayAbsenceTypeId(null);
    setStartDate(null);
    setCancellingPlan(false);
  }

  function confirmInvitationAction(): Promise<void> | undefined {
    if (!invitationConfirmAction) return;
    return new Promise<void>((resolve) => {
      invitationMutation.mutate(
        { action: invitationConfirmAction },
        { onSettled: () => resolve() },
      );
    });
  }

  const absenceTypes = bootstrapQuery.data?.absenceTypes ?? [];
  const chosenAbsenceTypeId = returnDate ? awayAbsenceTypeId : null;
  const chosenAbsence = absenceTypes.find((absenceType) => absenceType.id === chosenAbsenceTypeId);
  const chosenAbsenceName = chosenAbsence ? (chosenAbsence.name ?? chosenAbsence.label) : null;
  // The absence fills the days up to the return date, so it waits for one.
  const awayAbsenceChoices =
    absenceTypes.length > 0 ? (
      <View style={styles.statusTop}>
        <ProfileChoiceGroup
          items={[
            { id: -1, name: "No absence", disabled: !returnDate },
            ...absenceTypes.map((absenceType) => ({
              id: absenceType.id,
              name: absenceType.name ?? absenceType.label,
              disabled: !returnDate,
            })),
          ]}
          label="Absence"
          selection="single"
          selectedIds={[chosenAbsenceTypeId ?? -1]}
          onToggle={(id) => setAwayAbsenceTypeId(id === -1 ? null : id)}
        />
        {returnDate ? null : (
          <Text style={styles.statusMessage}>{AWAY_ABSENCE_NEEDS_DATE_MESSAGE}</Text>
        )}
      </View>
    ) : null;
  const isAway = person.status === "inactive";
  const startField = (
    <ReturnDateField
      disabled={statusMutation.isPending}
      emptyLabel="Today"
      hint={hasPlan && !statusChoice ? "Clear it to start their time away today." : null}
      label="Starts"
      minDate={orgToday}
      onChange={setStartDate}
      value={startDate}
    />
  );
  const choices = statusChoices(person).filter((choice) => choice.action !== statusOpening.exclude);
  const onlyChoice =
    statusOpening.focus === "plan"
      ? null
      : choices.length === 1 && !statusOpening.exclude
        ? choices[0]
        : statusOpening.only
          ? (choices.find((choice) => choice.action === statusOpening.only) ?? null)
          : null;
  const awayDetailsChanged =
    isAway &&
    (returnDate !== (person.awayUntil ?? null) ||
      chosenAbsenceTypeId !== (person.awayAbsenceTypeId ?? null));
  const planChanged =
    hasPlan &&
    !cancellingPlan &&
    !!laterStart &&
    (laterStart !== person.plannedFrom ||
      returnDate !== (person.plannedUntil ?? null) ||
      chosenAbsenceTypeId !== (person.plannedAbsenceTypeId ?? null));
  const showChoices = !onlyChoice && statusOpening.focus !== "plan";
  const plannedAbsence = absenceTypes.find(
    (absenceType) => absenceType.id === person.plannedAbsenceTypeId,
  );
  const statusCopy = statusChoice
    ? describeStatusAction(statusChoice, getFullName(person), {
        hasAccount: Boolean(person.userId),
        returnDate: statusChoice === "markAway" ? returnDate : null,
        absenceName: statusChoice === "markAway" ? chosenAbsenceName : null,
        startDate: statusChoice === "markAway" ? laterStart : null,
        plannedFrom:
          hasPlan && !(statusChoice === "markAway" && laterStart) ? person.plannedFrom : null,
      })
    : startsNow
      ? describeStatusAction("markAway", getFullName(person), {
          hasAccount: Boolean(person.userId),
          returnDate,
          absenceName: chosenAbsenceName,
        })
      : cancellingPlan
        ? describeStatusAction("cancelPlannedChange", getFullName(person), {
            absenceName: plannedAbsence ? (plannedAbsence.name ?? plannedAbsence.label) : null,
          })
        : planChanged
          ? describeStatusAction("setPlannedChange", getFullName(person), {
              startDate: laterStart,
              returnDate,
              absenceName: chosenAbsenceName,
            })
          : awayDetailsChanged
            ? describeStatusAction("setReturnDate", getFullName(person), {
                returnDate,
                currentReturnDate: person.awayUntil,
                absenceName: chosenAbsenceName,
              })
            : null;
  // A return date is the first day back, so the organization's tomorrow at the
  // earliest, or the day after a planned Away's start.
  const firstReturnDate = addDaysToIsoDate(laterStart ?? orgToday, 1);
  const invitationConfirmationTitle =
    invitationConfirmAction === "create"
      ? `Send an invitation to ${person.email}?`
      : invitationConfirmAction === "resend"
        ? `Reissue the invitation to ${person.email}?`
        : `Revoke the invitation to ${person.email}?`;
  const invitationConfirmationLead =
    invitationConfirmAction === "create"
      ? undefined
      : invitationConfirmAction === "resend"
        ? "The current invitation will be canceled."
        : "The invite link stops working.";
  const invitationConfirmationLabel =
    invitationConfirmAction === "create"
      ? "Send invitation"
      : invitationConfirmAction === "resend"
        ? "Reissue Invitation"
        : "Revoke Invitation";
  const invitationPendingLabel = invitationConfirmAction === "revoke" ? "Revoking" : "Sending";

  const editFieldErrors = editing
    ? getPersonEditFieldErrors(
        draft,
        serverFieldErrors,
        person.managementDepartmentIds.length > 0,
        focusAreaLabel,
      )
    : null;
  const hasEditValidationErrors = editFieldErrors
    ? Object.values(editFieldErrors).some(Boolean)
    : false;
  const footer = editing ? (
    <View>
      {confirmationError && !showSaveConfirmation ? (
        <InlineError message={confirmationError} />
      ) : null}
      <View style={styles.actionsRow}>
        <View style={styles.actionButton}>
          <Button
            compact
            disabled={updateMutation.isPending}
            // Same tri-state web uses. Discard resets the fields and stays on
            // the panel; leaving with edits in hand is the back gesture, which
            // goes through this guard's confirmation.
            label={getMobileEditorDismissLabel({ hasUnsavedChanges: hasChanges })}
            onPress={hasChanges ? guard.discard : guard.requestClose}
            tone="plain"
          />
        </View>
        <View style={styles.actionButton}>
          <Button
            compact
            disabled={updateMutation.isPending || !hasChanges || hasEditValidationErrors}
            label="Save changes"
            loading={updateMutation.isPending}
            onPress={handleSave}
          />
        </View>
      </View>
    </View>
  ) : null;

  return (
    <Screen
      bottomPaddingMode="stack"
      footer={footer}
      onRefresh={manualRefresh.refresh}
      onScroll={handlePersonScroll}
      refreshing={manualRefresh.isRefreshing}
      scrollEventThrottle={16}
    >
      {/* The native inline header is deliberately the person, not "Staff
          Profile". It stays compact and gets UIKit's scroll-edge blur from the
          route while the hero below scrolls beneath it, the same pattern
          ProfileScreen uses for the signed-in user's own name. */}
      <Stack.Screen
        options={{
          title: fullName,
          headerTitleStyle: {
            color: isCompactTitleVisible ? mobileColors.textPrimary : "transparent",
            fontFamily: mobileTypography.fontFamily.bold,
          },
          // Edit lives in the bar, where iOS puts it, not in the action row:
          // it is the one action about the page rather than about the person.
          // Cleared while editing, when the footer's Save and Cancel own it.
          ...createHeaderTextAction(
            canEdit && !editing
              ? {
                  label: "Edit",
                  accessibilityHint: "Opens the staff details editor",
                  onPress: () => {
                    setEditing(true);
                    setDraft(makeDraft(person));
                  },
                }
              : null,
          ),
        }}
      />
      <AccountLinkChallengeModal
        challenge={accountLinkChallenge}
        error={invitationError}
        isPending={invitationMutation.isPending}
        onCancel={() => {
          setInvitationError(null);
          setAccountLinkChallenge(null);
        }}
        onConfirm={() =>
          invitationMutation.mutate({
            action: "create",
            linkExistingAccount: true,
            reconcileName: accountLinkChallenge?.kind === "name_mismatch",
          })
        }
      />

      {/* The hero is the avatar, the name and the tier's insignia beside it,
          nothing else. A pill under the name used to spell the tier out too,
          and status and account chips sat there before that; each made a
          second heading out of a fact stated elsewhere. Status is the icon
          after the name and the status card below, and the role is the
          editor's Access row. */}
      <ProfileHero
        align="center"
        avatarStyle={{
          backgroundColor: avatarTone.backgroundColor,
          borderColor: avatarTone.borderColor,
          borderWidth: 1,
        }}
        avatarTextStyle={{ color: avatarTone.textColor }}
        initials={getProfileInitials(fullName)}
        orgRole={orgRole}
        title={fullName}
        titleAdornment={
          canViewEmployeeDetails ? <StatusMarkIcon person={person} size={18} /> : null
        }
      />

      {/* The contact pair, always both, as tiles the reader can name: a
          missing number or address dims its tile rather than dropping it, so
          the pair keeps its shape from one person to the next. Change status
          sits in the status card below; the rest that manages the person sits
          at the foot of the page. A viewer the API
          redacts contact details for gets no pair at all: two tiles that can
          never light up would be two things to wonder about. */}
      {!editing && canViewEmployeeDetails ? (
        <ProfileQuickActions>
          <ProfileQuickAction
            disabled={!person.phone}
            icon="call"
            iconTone="green"
            label="Call"
            onPress={() => {
              void Linking.openURL(`tel:${person.phone}`);
            }}
          />
          <ProfileQuickAction
            disabled={!person.email}
            icon="mail"
            iconTone="blue"
            label="Email"
            onPress={() => {
              void Linking.openURL(`mailto:${person.email}`);
            }}
          />
        </ProfileQuickActions>
      ) : null}

      {/* Where they stand, in the Change status sheet's words, under the
          contact pair: the sheet opens from here rather than the page foot. */}
      {!editing && canViewEmployeeDetails ? (
        <StatusCards
          absenceTypes={absenceTypes}
          disabled={statusMutation.isPending}
          onChangeStatus={canManageEmployees && !isSelf ? openStatusSheet : undefined}
          person={person}
        />
      ) : null}

      {/* Where the app account stands, one line under the actions rather than a
          chip competing with the name. Someone with an account needs no banner:
          the states worth surfacing are the two a manager can act on. */}
      {!editing && invitationBanner ? (
        <StatusBanner
          body={invitationBanner.body}
          title={invitationBanner.title}
          tone={invitationBanner.tone}
        />
      ) : null}

      {editing ? (
        <>
          {/* The role is the first setting in the editor, ahead of the name:
              it is the one that changes what the person can do. It applies on
              its own through the sheet's confirmation rather than with Save,
              since changing it may revoke and resend an invitation, which is
              nothing to bundle silently into a form submit. */}
          {canChangeOrgRole ? (
            <ProfileSection title="Access">
              <ProfileList>
                <ProfileNavRow
                  iconName="key-outline"
                  isLast
                  label="Access level"
                  value={ORG_ROLE_LABELS[orgRole]}
                  onPress={() => {
                    setOrgRoleError(null);
                    setShowOrgRole(true);
                  }}
                />
              </ProfileList>
            </ProfileSection>
          ) : null}
          <EditPanel
            certificationLabel={certificationLabel}
            certifications={bootstrapQuery.data?.certifications ?? []}
            saving={updateMutation.isPending}
            draft={draft}
            focusAreaLabel={focusAreaLabel}
            focusAreas={bootstrapQuery.data?.focusAreas ?? []}
            hasManagementAccess={person.managementDepartmentIds.length > 0}
            hasAccount={Boolean(person.userId)}
            serverFieldErrors={serverFieldErrors}
            onChange={(next) => {
              // A server verdict only holds for the value it was given. Editing
              // the field retires it and lets the debounced check speak again.
              setServerFieldErrors((current) => {
                const cleared = { ...current };
                for (const key of SERVER_CHECKED_FIELDS) {
                  if (draft[key] !== next[key]) cleared[key] = undefined;
                }
                return cleared;
              });
              setDraft(next);
            }}
            roleLabel={roleLabel}
            roles={bootstrapQuery.data?.roles ?? []}
            useCompactRoleCertificationLabels={useCompactRoleCertificationLabels}
          />
        </>
      ) : (
        <>
          {/* Contact details are a manager's view; the API blanks them for
              everyone else, and "No email on file" would state a blank as a
              fact. Managers still see the placeholder for a genuinely empty
              field. */}
          {canViewEmployeeDetails ? (
            <ProfileSection title="Contact">
              <ProfileList>
                <ProfileInfoRow
                  iconName="mail-outline"
                  label="Email"
                  value={person.email || "No email on file"}
                />
                <ProfileInfoRow
                  iconName="call-outline"
                  isLast
                  label="Phone"
                  value={person.phone || "No phone on file"}
                />
              </ProfileList>
            </ProfileSection>
          ) : null}

          {/* Split the way the edit panel below splits the same fields: what
              the person is hired as here, where they are placed under
              Assignments. The name row is gone with it, since the native header
              already carries it. */}
          {showStaffingSection ? (
            <ProfileSection title="Staffing">
              <ProfileList>
                {/* Web prints this beside the name in its staff header, and it is
                  how people are identified in payroll conversations. Regular
                  users have no business with a colleague's payroll identifier,
                  so it rides on the same permission web gates it behind. */}
                {canViewEmployeeDetails ? (
                  <ProfileInfoRow
                    iconName="card-outline"
                    label="Employee ID"
                    value={`#${person.employeeNumber}`}
                  />
                ) : null}
                {/* Full-time or part-time is an HR fact; the web roster hides
                  the column from regular users and so does this row. */}
                {canViewEmployeeDetails ? (
                  <ProfileInfoRow
                    iconName="briefcase-outline"
                    label="Employment"
                    value={employmentLabel}
                  />
                ) : null}
                {showCertificationRow ? (
                  <ProfileInfoRow
                    iconName="ribbon-outline"
                    isLast={!canManageEmployees || (!person.statusChangedAt && !person.statusNote)}
                    label={certificationLabel}
                    value={certificationName}
                  />
                ) : null}
                {canManageEmployees && person.statusChangedAt ? (
                  <ProfileInfoRow
                    iconName="calendar-outline"
                    isLast={!person.statusNote}
                    label="Status updated"
                    value={formatDate(person.statusChangedAt)}
                  />
                ) : null}
                {canManageEmployees && person.statusNote ? (
                  <ProfileInfoRow
                    iconName="document-text-outline"
                    isLast
                    label="Status note"
                    value={person.statusNote}
                  />
                ) : null}
              </ProfileList>
            </ProfileSection>
          ) : null}

          <ProfileSection title="Assignments">
            <ProfileList>
              {/* The two kinds of department are different facts about a
                  person — where they are scheduled, and what they manage — so
                  they take a row each rather than one merged list. The
                  management row sits directly under its scheduled counterpart
                  instead of in a section of its own, which read as a second
                  Assignments block for anyone who had both. */}
              <ProfileInfoRow
                iconName="business-outline"
                label={departmentLabel}
                value={scheduledDepartmentNames}
              />
              {/* Gated on the departments themselves, not on
                  `hasManagementAccess`: that is also true for a plain staff app
                  invitation, and would print an empty row for one. */}
              {person.managementDepartmentIds.length > 0 ? (
                <ProfileInfoRow
                  iconName="briefcase-outline"
                  label={MANAGEMENT_DEPARTMENT_LABELS.plural}
                  value={managementDepartmentNames}
                />
              ) : null}
              <ProfileInfoRow
                iconName="albums-outline"
                isLast={!showRolesRow}
                label={focusAreaLabel}
                value={focusAreaNames}
              />
              {showRolesRow ? (
                <ProfileInfoRow
                  iconName="people-circle-outline"
                  isLast
                  label={roleLabel}
                  value={roleNames}
                />
              ) : null}
            </ProfileList>
          </ProfileSection>

          {canManageEmployees && person.contactNotes ? (
            <ProfileSection title="Notes">
              <ProfilePanel>
                <Text style={styles.noteText}>{person.contactNotes}</Text>
              </ProfilePanel>
            </ProfileSection>
          ) : null}

          {/* The management actions end the page, untitled: every button
              names its own action. Full width, one under the other, in web's
              staff-panel order: access first, status last, so granting the
              app is the everyday action and the one that takes them off it
              sits at the very bottom on its own. */}
          {canManageEmployees ? (
            <ProfileActionStack>
              {!person.userId && person.status !== "removed" && person.email ? (
                person.pendingInvitation ? (
                  <>
                    <Button
                      label="Reinvite"
                      loading={invitationMutation.isPending}
                      onPress={() => setInvitationConfirmAction("resend")}
                      tone="neutral"
                    />
                    <Button
                      disabled={invitationMutation.isPending}
                      label="Revoke invite"
                      onPress={() => setInvitationConfirmAction("revoke")}
                      tone="danger"
                    />
                  </>
                ) : (
                  <Button
                    label="Send invitation"
                    loading={invitationMutation.isPending}
                    onPress={() => setInvitationConfirmAction("create")}
                    tone="secondary"
                  />
                )
              ) : null}
              {/* Only offered to someone who isn't on the grid at all. Anyone
                  with focus areas changes them in the edit panel, where
                  clearing them all is what takes them back off it. */}
              {person.status !== "removed" && !isOnSchedule ? (
                <Button
                  label="Add to schedule"
                  onPress={() =>
                    router.push({
                      pathname: "/person/[id]/schedule",
                      params: { id: person.id },
                    })
                  }
                  tone="secondary"
                />
              ) : null}
              {/* Granting management access to someone with no account sends
                  an invitation, and an invitation needs an address. With no
                  email on file the button stays off the page rather than
                  opening a sheet that can only say so; the editor is where an
                  address gets added. Existing access is still editable and
                  removable whatever the contact details say. */}
              {canManageManagementAccess &&
              person.status !== "removed" &&
              !isSelf &&
              (hasManagementAccess(person) || person.email) ? (
                <Button
                  label={
                    hasManagementAccess(person) ? "Edit management access" : "Add to management"
                  }
                  onPress={() => setShowManagementAccess(true)}
                  tone="secondary"
                />
              ) : null}
            </ProfileActionStack>
          ) : null}
        </>
      )}

      <ConfirmationModal
        body="Check the address before saving."
        confirmLabel="Save"
        error={confirmationError}
        loading={updateMutation.isPending}
        onCancel={() => {
          setConfirmationError(null);
          setShowSaveConfirmation(false);
        }}
        onConfirm={confirmSave}
        title={
          draft?.email.trim()
            ? `Change the staff email to ${draft.email.trim()}?`
            : "Change the staff email?"
        }
        visible={showSaveConfirmation && !stepUp.active}
      />
      {stepUp.sheet}
      <ConfirmationModal {...guard.confirmationProps} />
      <BottomSheetModal
        debugName="Change status"
        dismissDisabled={statusMutation.isPending}
        header={
          <SheetHeader
            title={
              statusCopy?.title ??
              (statusOpening.focus === "plan"
                ? isAway
                  ? `Change ${getFullName(person)}'s return date?`
                  : `Change ${getFullName(person)}'s planned away?`
                : `Change ${getFullName(person)}'s status?`)
            }
          />
        }
        // The discard prompt rides inside the sheet: iOS refuses a second
        // Modal while this one is up, so as a sibling it never appeared and a
        // dismissal with a reason typed or a status picked went nowhere.
        overlay={<ConfirmationModal presentation="inline" {...statusGuard.confirmationProps} />}
        scrollable
        visible={confirmAction === "status"}
        onDismiss={statusGuard.requestClose}
        footer={
          <>
            {confirmationError ? <InlineError message={confirmationError} /> : null}
            <SheetActions
              primaryAction={
                <Button
                  disabled={
                    !statusChoice &&
                    !awayDetailsChanged &&
                    !planChanged &&
                    !cancellingPlan &&
                    !startsNow
                  }
                  label={
                    statusChoice || cancellingPlan || startsNow
                      ? (statusCopy?.label ?? "")
                      : isAway || (hasPlan && statusOpening.focus !== "status")
                        ? "Save changes"
                        : "Change status"
                  }
                  loading={statusMutation.isPending}
                  onPress={confirmStatusAction}
                  tone={
                    statusChoice === "archive"
                      ? "danger"
                      : statusChoice === "markAway" || statusChoice === "suspend" || startsNow
                        ? "warning"
                        : "primary"
                  }
                />
              }
            >
              <Button
                label="Cancel"
                disabled={statusMutation.isPending}
                onPress={statusGuard.requestClose}
                tone="plain"
              />
            </SheetActions>
          </>
        }
      >
        <View style={showChoices ? [styles.statusTop, styles.statusTopDivided] : styles.statusTop}>
          <StatusCards absenceTypes={absenceTypes} person={person} plain />
          {isAway && !statusChoice ? (
            <>
              <ReturnDateField
                disabled={statusMutation.isPending}
                minDate={firstReturnDate}
                onChange={setReturnDate}
                value={returnDate}
              />
              {awayAbsenceChoices}
            </>
          ) : null}
          {hasPlan && !statusChoice && statusOpening.focus !== "status" ? (
            <>
              {cancellingPlan ? null : (
                <>
                  {startField}
                  <ReturnDateField
                    disabled={statusMutation.isPending}
                    minDate={firstReturnDate}
                    onChange={setReturnDate}
                    value={returnDate}
                  />
                  {awayAbsenceChoices}
                </>
              )}
              <Button
                compact
                disabled={statusMutation.isPending}
                label={cancellingPlan ? "Keep planned away" : "Cancel planned away"}
                onPress={() => setCancellingPlan((value) => !value)}
                tone="plain"
              />
            </>
          ) : null}
        </View>
        {onlyChoice ? (
          <Text style={styles.statusMessage}>{onlyChoice.outcome}</Text>
        ) : !showChoices ? null : (
          <ProfileChoiceGroup
            items={choices.map((choice) => ({
              id: choice.action,
              name: choice.label,
              detail: choice.detail,
              leading: (
                <StatusIconCircle
                  name={STATUS_KIND_ICONS[choice.kind]}
                  size={30}
                  tone={STATUS_KIND_TONES[choice.kind]}
                />
              ),
            }))}
            label="Change to"
            selection="single"
            selectedIds={statusChoice ? [statusChoice] : []}
            onToggle={(id) => {
              setStatusChoice(id);
              setCancellingPlan(false);
            }}
          />
        )}
        {statusChoice === "markAway" || statusChoice === "archive" ? (
          <ProfileTextInput
            editable={!statusMutation.isPending}
            accessibilityLabel="Reason"
            autoCapitalize="sentences"
            label="Reason"
            placeholder={
              statusChoice === "archive"
                ? "Reason (optional) - e.g. Left the company"
                : "Reason (optional) - e.g. Family leave"
            }
            value={inactiveNote}
            onChangeText={setInactiveNote}
          />
        ) : null}
        {statusChoice === "markAway" ? (
          <>
            {startField}
            <ReturnDateField
              disabled={statusMutation.isPending}
              minDate={firstReturnDate}
              onChange={setReturnDate}
              value={returnDate}
            />
            {awayAbsenceChoices}
          </>
        ) : null}
        {statusCopy?.message ? (
          <Text style={styles.statusMessage}>{statusCopy.message}</Text>
        ) : null}
        {statusCopy ? (
          <ConfirmSummaryBox summary={{ title: "Changes", points: statusCopy.points }} />
        ) : null}
        {statusCopy ? (
          <ConfirmSummaryBox summary={{ title: "Stays the same", points: statusCopy.unchanged }} />
        ) : null}
      </BottomSheetModal>
      <ManagementAccessSheet
        managementDepartments={managementDepartments}
        onDismiss={() => setShowManagementAccess(false)}
        person={person}
        visible={showManagementAccess}
      />
      <OrgRoleSheet
        error={orgRoleError}
        isPending={orgRoleMutation.isPending}
        onDismiss={() => {
          setOrgRoleError(null);
          setShowOrgRole(false);
        }}
        onSubmit={(orgRole) =>
          new Promise<void>((resolve) => {
            orgRoleMutation.mutate(orgRole, { onSettled: () => resolve() });
          })
        }
        subject={getPersonOrgRoleSubject(person)}
        visible={showOrgRole}
      />
      <ConfirmationModal
        body={invitationConfirmationLead}
        confirmLabel={invitationConfirmationLabel}
        confirmTone={invitationConfirmAction === "revoke" ? "danger" : "primary"}
        error={invitationError}
        loading={invitationMutation.isPending}
        onCancel={() => {
          setInvitationError(null);
          setInvitationConfirmAction(null);
        }}
        onConfirm={confirmInvitationAction}
        title={invitationConfirmationTitle}
        visible={invitationConfirmAction != null}
      />
    </Screen>
  );
}

function AccountLinkChallengeModal({
  challenge,
  error,
  isPending,
  onCancel,
  onConfirm,
}: {
  challenge: MobileAccountLinkChallenge | null;
  error: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [displayed, setDisplayed] = useState(challenge);

  useEffect(() => {
    if (challenge) setDisplayed(challenge);
  }, [challenge]);

  if (!displayed) return null;

  const accountName =
    `${displayed.details.accountFirstName} ${displayed.details.accountLastName}`.trim() ||
    "this account";
  const employeeName =
    `${displayed.details.employeeFirstName} ${displayed.details.employeeLastName}`.trim() ||
    "this staff profile";
  const isMismatch = displayed.kind === "name_mismatch";
  const title = isMismatch ? "Name mismatch found" : "Account found";
  const subtitle = isMismatch
    ? "Review the existing account before linking it."
    : "Confirm that this is the right app account.";

  return (
    <BottomSheetModal
      dismissDisabled={isPending}
      header={<SheetHeader subtitle={subtitle} title={title} />}
      onDismiss={onCancel}
      visible={challenge != null}
    >
      <View style={styles.modalInfoPanel}>
        <Text style={styles.modalInfoTitle}>
          {isMismatch ? "The account name is different" : "Existing app account found"}
        </Text>
        <Text style={styles.modalInfoText}>
          {isMismatch
            ? "The existing account is under a different name. Linking it updates the staff profile to match the account name."
            : "An existing app account matches this staff profile. You can link it instead of sending a new invitation."}
        </Text>
      </View>

      <ProfileList>
        <ProfileInfoRow label="Staff profile" value={employeeName} />
        <ProfileInfoRow isLast label="Account name" value={accountName} />
      </ProfileList>

      <View style={styles.modalActionStack}>
        {error ? <InlineError message={error} /> : null}
        <SheetActions
          primaryAction={
            <Button
              disabled={isPending}
              label={isMismatch ? "Use account name" : "Link existing account"}
              loading={isPending}
              onPress={onConfirm}
            />
          }
        >
          <Button disabled={isPending} label="Cancel" onPress={onCancel} tone="neutral" />
        </SheetActions>
      </View>
    </BottomSheetModal>
  );
}

function buildLookupMaps(data: MobileBootstrapResponse | undefined) {
  const useCompactLabels = data?.currentOrg?.useCompactRoleCertificationLabels ?? false;
  return {
    focusAreas: new Map((data?.focusAreas ?? []).map((item) => [item.id, item.name])),
    roles: new Map(
      (data?.roles ?? []).map((item) => [
        item.id,
        useCompactLabels ? item.abbr || item.name : item.name,
      ]),
    ),
    certifications: new Map(
      (data?.certifications ?? []).map((item) => [
        item.id,
        useCompactLabels ? item.abbr || item.name : item.name,
      ]),
    ),
  };
}

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function formatIdList(ids: number[], map: Map<number, string>): string {
  return formatNameList(
    ids.map((id) => map.get(id)).filter((value): value is string => Boolean(value)),
  );
}

function formatNameList(names: string[]): string {
  return names.length > 0 ? names.join(", ") : "None";
}

function EditPanel({
  draft,
  saving,
  focusAreaLabel,
  focusAreas,
  certificationLabel,
  certifications,
  roleLabel,
  roles,
  useCompactRoleCertificationLabels,
  hasManagementAccess,
  hasAccount,
  serverFieldErrors,
  onChange,
}: {
  draft: EditDraft;
  saving: boolean;
  focusAreaLabel: string;
  focusAreas: MobileFocusArea[];
  certificationLabel: string;
  certifications: MobileNamedItem[];
  roleLabel: string;
  hasManagementAccess: boolean;
  hasAccount: boolean;
  roles: MobileBootstrapRole[];
  useCompactRoleCertificationLabels: boolean;
  serverFieldErrors: Partial<Record<MobileStaffField, string>>;
  onChange: (draft: EditDraft) => void;
}) {
  const [focusedField, setFocusedField] = useState<
    "firstName" | "lastName" | "phone" | "email" | "contactNotes" | null
  >(null);
  const fieldErrors = getPersonEditFieldErrors(
    draft,
    serverFieldErrors,
    hasManagementAccess,
    focusAreaLabel,
    hasAccount,
  );
  const setField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };
  const assignmentNotices =
    hasManagementAccess && draft.focusAreaIds.length === 0
      ? ["Saving now removes them from the schedule. They'll keep management access."]
      : [];
  const toggle = (key: "focusAreaIds" | "roleIds", id: number) => {
    const current = draft[key];
    setField(
      key,
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  return (
    <>
      <ProfileSection title="Basic info">
        <ProfilePanel>
          <ProfileTextInput
            accessibilityLabel="First name"
            autoCapitalize="words"
            editable={!saving}
            error={fieldErrors.firstName}
            focused={focusedField === "firstName"}
            label="First name"
            placeholder="First name"
            value={draft.firstName}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => setField("firstName", value)}
            onFocus={() => setFocusedField("firstName")}
          />
          <ProfileTextInput
            accessibilityLabel="Last name"
            autoCapitalize="words"
            editable={!saving}
            error={fieldErrors.lastName}
            focused={focusedField === "lastName"}
            label="Last name"
            placeholder="Last name"
            value={draft.lastName}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => setField("lastName", value)}
            onFocus={() => setFocusedField("lastName")}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Contact">
        <ProfilePanel>
          <ProfileTextInput
            accessibilityLabel="Phone"
            editable={!saving}
            error={fieldErrors.phone}
            focused={focusedField === "phone"}
            keyboardType="phone-pad"
            autoComplete="tel"
            label="Phone"
            placeholder="Phone"
            value={draft.phone}
            onBlur={() => {
              setFocusedField(null);
              if (!fieldErrors.phone && draft.phone.trim()) {
                setField("phone", normalizeOptionalUsPhone(draft.phone));
              }
            }}
            onChangeText={(value) => setField("phone", value)}
            onFocus={() => setFocusedField("phone")}
          />
          <ProfileTextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            editable={!saving}
            error={fieldErrors.email}
            focused={focusedField === "email"}
            keyboardType="email-address"
            autoComplete="email"
            autoCorrect={false}
            label="Email"
            placeholder="Email"
            value={draft.email}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => setField("email", value)}
            onFocus={() => setFocusedField("email")}
          />
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Staffing">
        <ProfileChoiceGroup
          items={[
            { id: 0, name: "Full-time" },
            { id: 1, name: "Part-time" },
          ]}
          label="Employment"
          selection="single"
          selectedIds={[draft.employmentType === "part_time" ? 1 : 0]}
          onToggle={(id) => setField("employmentType", id === 1 ? "part_time" : "full_time")}
        />
        <ProfileChoiceGroup
          items={[
            { id: -1, name: "None" },
            ...certifications.map((item) => ({
              id: item.id,
              name: useCompactRoleCertificationLabels ? item.abbr || item.name : item.name,
            })),
          ]}
          label={certificationLabel}
          selection="single"
          selectedIds={draft.certificationId == null ? [-1] : [draft.certificationId]}
          onToggle={(id) => setField("certificationId", id === -1 ? null : id)}
        />
      </ProfileSection>

      <ProfileSection title="Assignments">
        {/* Raised once for the whole section rather than under the chips that
            produced it. Only management users can come off the schedule at
            all - for anyone else an empty set is the group's own validation
            error, which stays where it is. */}
        <SectionNotice messages={assignmentNotices} />
        <ProfileChoiceGroup
          error={fieldErrors.focusAreaIds}
          items={focusAreas.map((item) => ({
            id: item.id,
            name: item.name,
          }))}
          label={focusAreaLabel}
          selectedIds={draft.focusAreaIds}
          onToggle={(id) => toggle("focusAreaIds", id)}
        />
        <ProfileChoiceGroup
          items={roles
            .filter(
              (item) =>
                !isRoleCertificationBlocked({
                  role: item,
                  certificationId: draft.certificationId,
                  selectedRoleIds: draft.roleIds,
                  roleId: item.id,
                }),
            )
            .map((item) => ({
              id: item.id,
              name: useCompactRoleCertificationLabels ? item.abbr || item.name : item.name,
            }))}
          label={roleLabel}
          selectedIds={draft.roleIds}
          onToggle={(id) => toggle("roleIds", id)}
        />
      </ProfileSection>

      <ProfileSection title="Notes">
        <ProfilePanel>
          <ProfileTextInput
            accessibilityLabel="Internal notes"
            editable={!saving}
            error={fieldErrors.contactNotes}
            focused={focusedField === "contactNotes"}
            label="Internal notes"
            multiline
            placeholder="Internal notes"
            value={draft.contactNotes}
            onBlur={() => setFocusedField(null)}
            onChangeText={(value) => setField("contactNotes", value)}
            onFocus={() => setFocusedField("contactNotes")}
          />
        </ProfilePanel>
      </ProfileSection>
    </>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    actionsRow: {
      flexDirection: "row",
      gap: mobileSpace.md,
    },
    actionButton: {
      flex: 1,
    },
    statusTop: {
      gap: mobileSpace.md,
    },
    statusTopDivided: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingBottom: mobileSpace.lg,
    },
    statusMessage: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    noteText: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    modalInfoPanel: {
      backgroundColor: mobileColors.surfaceSecondary,
      // A hairline, not `cardBorder`. Cards on the page are drawn by their
      // shadow, which is why `cardBorder` is transparent in light mode - but a
      // card inside a sheet is deliberately flat (see `flatInSheet`), so with
      // no shadow to draw it there was no edge at all in light mode. Dark is
      // unchanged: `cardBorder` already resolves to this token there.
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: 8,
      padding: 16,
    },
    modalInfoTitle: {
      ...mobileTextWeighted("rowTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    modalInfoText: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    modalActionStack: {
      gap: mobileSpace.md,
      paddingTop: 4,
    },
  });
