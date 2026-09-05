import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MobileDepartment, MobilePerson } from "@dubgrid/contracts";
import { AppText } from "../../../shared/components/AppText";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { Chip } from "../../../shared/components/Chip";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { InlineError } from "../../../shared/components/InlineError";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../../../shared/components/SegmentedControl";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import {
  removeMobilePersonManagementAccess,
  updateMobilePersonManagementAccess,
} from "../../../shared/lib/api";
import { MANAGEMENT_DEPARTMENT_LABELS } from "../../../shared/lib/departments";
import { getClientFriendlyErrorMessage } from "../../../shared/lib/errors";
import { useToast } from "../../../shared/providers/ToastProvider";
import { mobileSpace } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { hasManagementAccess, type ManagementAccessRole } from "../lib/managementAccess";
import { ORG_ROLE_LABELS } from "../lib/orgRoleBadges";

/**
 * Every tier, whether or not they already have an account.
 *
 * Super Admin used to be offered only on the invitation path, on the theory that
 * promoting a linked member was the access badge's job. That split was invisible
 * from here: the same sheet showed three tiers for one person and two for
 * another, with nothing on screen explaining why. Both paths reach the same
 * guarded write, so both offer the same choices.
 */
const ROLE_OPTIONS: SegmentedOption<ManagementAccessRole>[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * Grant, edit or revoke management access for someone who already has a staff
 * profile.
 *
 * A sheet, not a pushed screen: management settings always open in a popup over
 * whatever raised them. It is a focused task with its own save and discard
 * lifecycle, and it does not compete for space with the person's own page.
 *
 * Which write the server performs (membership update vs invitation) follows from
 * whether they have an account, so this sheet doesn't decide it - it only ever
 * sends a role and a set of departments.
 */
export function ManagementAccessSheet({
  visible,
  person,
  managementDepartments,
  onDismiss,
}: {
  visible: boolean;
  person: MobilePerson;
  managementDepartments: MobileDepartment[];
  onDismiss: () => void;
}) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const baseline = {
    orgRole: (person.orgRole ??
      person.pendingInvitation?.roleToAssign ??
      "user") as ManagementAccessRole,
    managementDepartmentIds: person.managementDepartmentIds,
  };
  const [draft, setDraft] = useState(baseline);
  const [wasVisible, setWasVisible] = useState(visible);
  const [error, setError] = useState<string | null>(null);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<ManagementAccessRole | null>(null);

  // Reseed on open rather than on every `person` identity change: a background
  // refetch hands down a new object, and keying off that would wipe whatever the
  // user had half-picked in an open sheet. Adjusted during render, not in an
  // effect, so the first painted frame already shows the right values.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(baseline);
      setError(null);
    }
  }

  const hasUnsavedChanges =
    draft.orgRole !== baseline.orgRole ||
    !sameIds(draft.managementDepartmentIds, baseline.managementDepartmentIds);

  const mutation = useMutation({
    mutationFn: async (
      input:
        { orgRole: ManagementAccessRole; managementDepartmentIds: number[] } | { remove: true },
    ) => {
      const guards = {
        expectedMembershipUpdatedAt: person.membershipUpdatedAt,
        expectedInvitationUpdatedAt: person.pendingInvitation?.updatedAt ?? null,
      };
      return "remove" in input
        ? removeMobilePersonManagementAccess(accessToken!, person.id, guards)
        : updateMobilePersonManagementAccess(accessToken!, person.id, {
            ...guards,
            orgRole: input.orgRole,
            managementDepartmentIds: input.managementDepartmentIds,
            email: person.email || undefined,
          });
    },
    onMutate: () => setError(null),
    onError: (mutationError) => {
      // Rendered in the sheet rather than a toast: this is a `<Modal>` with its
      // own native window, so a toast pushed from here paints behind it and the
      // failure looks like the button doing nothing.
      setError(
        getClientFriendlyErrorMessage(
          mutationError,
          "We couldn't update their management access right now.",
        ),
      );
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "person"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "people"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "management-users"] }),
      ]);
      onDismiss();
      pushToast({
        tone: "success",
        title:
          result.result === "access_removed"
            ? "Management access removed"
            : result.result === "invitation_sent"
              ? "Management invitation sent"
              : "Management access updated",
        message:
          result.result === "invitation_sent"
            ? "They'll join management once they accept."
            : "Their management access was updated.",
      });
    },
  });

  const guard = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    disabled: mutation.isPending,
    body: "Your changes to their management access will be lost.",
    onDiscard: () => setDraft(baseline),
    onClose: onDismiss,
  });

  const isEditing = hasManagementAccess(person);
  // Dirtiness is part of it, not just validity: a Save that is live on an
  // untouched sheet invites a no-op write, and the same value already decides
  // whether closing asks, so the button and the discard prompt cannot disagree.
  const canSubmit =
    !mutation.isPending &&
    hasUnsavedChanges &&
    draft.managementDepartmentIds.length > 0 &&
    managementDepartments.length > 0;

  function toggleDepartment(departmentId: number) {
    setDraft((current) => ({
      ...current,
      managementDepartmentIds: current.managementDepartmentIds.includes(departmentId)
        ? current.managementDepartmentIds.filter((id) => id !== departmentId)
        : [...current.managementDepartmentIds, departmentId],
    }));
  }

  function submit() {
    // Changing the role on an invitation means revoking and reissuing it, which
    // is worth saying out loud before it happens.
    if (person.pendingInvitation && draft.orgRole !== baseline.orgRole) {
      setPendingRoleChange(draft.orgRole);
      return;
    }
    mutation.mutate(draft);
  }

  return (
    <>
      <BottomSheetModal
        debugName="Management access"
        footer={
          <>
            {error ? <InlineError message={error} /> : null}
            <SheetActions>
              {/* One label for both branches, as on web. "Send Invitation" would
                  also collide with the staff-invitation action on the page behind
                  this sheet, which does something else entirely. */}
              <Button
                disabled={!canSubmit}
                label="Save Access"
                loading={mutation.isPending}
                onPress={submit}
                tone="primary"
              />
              {isEditing ? (
                <Button
                  disabled={mutation.isPending}
                  label="Remove from Management"
                  onPress={() => setShowRemoveConfirmation(true)}
                  tone="danger"
                />
              ) : null}
              <Button
                disabled={mutation.isPending}
                label="Cancel"
                onPress={guard.requestClose}
                tone="neutral"
              />
            </SheetActions>
          </>
        }
        header={
          <SheetHeader
            subtitle={`${person.firstName} ${person.lastName}`.trim() || person.email}
            title={isEditing ? "Edit management access" : "Add to management"}
          />
        }
        scrollable
        visible={visible}
        onDismiss={guard.requestClose}
      >
        {managementDepartments.length === 0 ? (
          <AppText tone="secondary" variant="body">
            {`There are no ${MANAGEMENT_DEPARTMENT_LABELS.pluralLower} yet. Add one on the web app, under Settings, before granting management access.`}
          </AppText>
        ) : (
          <View style={{ gap: mobileSpace.lg }}>
            <View style={{ gap: mobileSpace.sm }}>
              <AppText tone="secondary" variant="label">
                Access level
              </AppText>
              <SegmentedControl
                accessibilityLabel="Access level"
                disabled={mutation.isPending}
                onChange={(orgRole) => setDraft((current) => ({ ...current, orgRole }))}
                options={ROLE_OPTIONS}
                value={draft.orgRole}
              />
            </View>

            <View style={{ gap: mobileSpace.sm }}>
              <AppText tone="secondary" variant="label">
                {MANAGEMENT_DEPARTMENT_LABELS.plural}
              </AppText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobileSpace.xs }}>
                {managementDepartments.map((department) => (
                  <Chip
                    key={department.id}
                    label={department.abbr || department.name}
                    onPress={() => toggleDepartment(department.id)}
                    selected={draft.managementDepartmentIds.includes(department.id)}
                  />
                ))}
              </View>
              {draft.managementDepartmentIds.length === 0 ? (
                <AppText tone="danger" variant="meta">
                  {`Select at least one ${MANAGEMENT_DEPARTMENT_LABELS.singularLower}`}
                </AppText>
              ) : null}
            </View>

            {!person.userId ? (
              <AppText tone="secondary" variant="meta">
                {person.email
                  ? `An invitation will be sent to ${person.email}.`
                  : "Add an email address to this staff profile before inviting them."}
              </AppText>
            ) : null}
          </View>
        )}
      </BottomSheetModal>

      <ConfirmationModal {...guard.confirmationProps} />

      <ConfirmationModal
        body={`Change access from ${ORG_ROLE_LABELS[baseline.orgRole]} to ${ORG_ROLE_LABELS[pendingRoleChange ?? baseline.orgRole]}? The current invitation will be revoked and a replacement will be sent to ${person.pendingInvitation?.email ?? person.email}.`}
        confirmLabel="Revoke and resend"
        confirmTone="danger"
        loading={mutation.isPending}
        onCancel={() => setPendingRoleChange(null)}
        onConfirm={() => {
          const orgRole = pendingRoleChange;
          setPendingRoleChange(null);
          if (orgRole) mutation.mutate({ ...draft, orgRole });
        }}
        title="Replace invitation access?"
        visible={pendingRoleChange !== null}
      />

      <ConfirmationModal
        body="They'll come off the management roster. Their staff profile and schedule stay exactly as they are."
        confirmLabel="Remove Access"
        confirmTone="danger"
        loading={mutation.isPending}
        onCancel={() => setShowRemoveConfirmation(false)}
        onConfirm={() => {
          setShowRemoveConfirmation(false);
          mutation.mutate({ remove: true });
        }}
        title="Remove management access?"
        visible={showRemoveConfirmation}
      />
    </>
  );
}
