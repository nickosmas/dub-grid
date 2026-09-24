import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MobileDepartment, MobileManagementUser } from "@dubgrid/contracts";
import { AppText } from "../../../shared/components/AppText";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { InlineError } from "../../../shared/components/InlineError";
import {
  removeMobileManagementUser,
  updateMobileManagementUser,
  updateMobileManagementUserInvitation,
} from "../../../shared/lib/api";
import { getDepartmentNames, MANAGEMENT_DEPARTMENT_LABELS } from "../../../shared/lib/departments";
import { mobileSpace } from "../../../shared/theme/tokens";
import { getClientFriendlyErrorMessage } from "../../../shared/lib/errors";
import { useModalHandoff } from "../../../shared/hooks/useModalHandoff";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { ManagementUserAccessSheet } from "./ManagementUserAccessSheet";
import { OrgRoleSheet } from "./OrgRoleSheet";

type InvitationConfirmAction = "resend" | "revoke" | null;

function getFullName(managementUser: MobileManagementUser): string {
  return (
    `${managementUser.firstName} ${managementUser.lastName}`.trim() ||
    managementUser.email ||
    "Unnamed person"
  );
}

/**
 * Everything you can do to a management user who has no staff profile to do it
 * from.
 *
 * Every other roster row opens the staff profile, which is the one page that
 * holds a person's settings. What is left over cannot: a management-only
 * invitation has no `employees` row until it is accepted, so there is no
 * person to open. Rather than keep a second profile screen alive for that
 * case, its two or three actions come up as a sheet on the roster itself.
 *
 * It owns its own mutations, unlike the presentational sheets beside it: the
 * alternative was moving the whole of the retired management profile's write
 * logic into the People screen, which is long enough already.
 */
export function ManagementUserActionsSheet({
  managementUser,
  managementDepartments,
  onDismiss,
}: {
  /** The roster row being acted on, or null while the sheet is closed. */
  managementUser: MobileManagementUser | null;
  managementDepartments: MobileDepartment[];
  onDismiss: () => void;
}) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const handoff = useModalHandoff();
  const [showAccessSheet, setShowAccessSheet] = useState(false);
  const [showRoleSheet, setShowRoleSheet] = useState(false);
  const [isActionsHidden, setIsActionsHidden] = useState(false);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
  const [invitationConfirmAction, setInvitationConfirmAction] =
    useState<InvitationConfirmAction>(null);
  const [error, setError] = useState<string | null>(null);
  // The last person this sheet was opened for, kept so it has something to draw
  // while it animates out. Rendering straight off `managementUser` unmounted the
  // `<Modal>` the moment the parent cleared it, so this one sheet vanished
  // instantly while every other sheet in the app faded.
  const [displayed, setDisplayed] = useState(managementUser);

  useEffect(() => {
    if (managementUser) {
      setDisplayed(managementUser);
      return;
    }

    // Fully closed. Forget which sub-sheet was on top so the next person opens
    // on the actions list rather than wherever the last one left off.
    setIsActionsHidden(false);
    setShowAccessSheet(false);
    setShowRoleSheet(false);
    setError(null);
  }, [managementUser]);

  function invalidateRoster() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "management-users"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "people"] }),
    ]);
  }

  function closeEverything() {
    // Whatever is on top leaves first, then the sheet underneath it. Both in one
    // commit is the case iOS drops, which left the actions sheet on screen with
    // a live backdrop after a successful save.
    setShowAccessSheet(false);
    setShowRoleSheet(false);
    setShowRemoveConfirmation(false);
    setInvitationConfirmAction(null);
    handoff(onDismiss);
  }

  const accessMutation = useMutation({
    mutationFn: async (
      input:
        | { orgRole: MobileManagementUser["orgRole"]; managementDepartmentIds: number[] }
        | { remove: true },
    ) => {
      if (!managementUser) throw new Error("Management user unavailable");
      if ("remove" in input) {
        return removeMobileManagementUser(accessToken!, managementUser.id, {
          expectedUpdatedAt: managementUser.updatedAt,
        });
      }
      return updateMobileManagementUser(accessToken!, managementUser.id, {
        orgRole: input.orgRole ?? "user",
        managementDepartmentIds: input.managementDepartmentIds,
        expectedUpdatedAt: managementUser.updatedAt,
      });
    },
    // Inline, not a toast. This sheet stays open on failure, and a toast pushed
    // from inside a `<Modal>` renders in the root window behind it — so the
    // whole of the feedback was invisible and the button just stopped spinning.
    onError: (mutationError) => {
      setError(
        getClientFriendlyErrorMessage(
          mutationError,
          "We couldn't update their management access right now.",
        ),
      );
    },
    onMutate: () => setError(null),
    onSuccess: async (result, input) => {
      // Closed either way: the roster behind this sheet is what shows the
      // result, and a sheet left open over it would be showing the old row.
      closeEverything();
      await invalidateRoster();
      // The same write carries a department edit and an access-level change,
      // so the input is what says which one just happened.
      const roleChanged =
        !("remove" in input) && managementUser != null && input.orgRole !== managementUser.orgRole;
      pushToast({
        tone: "success",
        title:
          result.result === "access_removed"
            ? "Management access removed"
            : roleChanged
              ? "Access level updated"
              : "Management access updated",
        message: roleChanged
          ? "Their access level was updated."
          : "Their management access was updated.",
      });
    },
  });

  const invitationMutation = useMutation({
    mutationFn: async (action: "resend" | "revoke") => {
      if (!managementUser) throw new Error("Management user unavailable");
      return updateMobileManagementUserInvitation(accessToken!, managementUser.id, {
        action,
        expectedUpdatedAt: managementUser.updatedAt,
      });
    },
    onError: (mutationError) => {
      setError(
        getClientFriendlyErrorMessage(
          mutationError,
          "We couldn't update that invitation right now.",
        ),
      );
      // A failed send restores the previous link and changes the row's
      // version, so refresh before the next attempt checks it.
      void invalidateRoster();
    },
    onMutate: () => setError(null),
    onSuccess: async (result) => {
      closeEverything();
      await invalidateRoster();
      pushToast({
        tone: "success",
        title: result.result === "invitation_revoked" ? "Invitation revoked" : "Invitation resent",
        message: "Their management invitation was updated.",
      });
    },
  });

  if (!displayed) return null;

  const fullName = getFullName(displayed);
  const isPendingInvite = displayed.source === "pending_invite";
  const departmentNames = getDepartmentNames(
    displayed.managementDepartmentIds,
    managementDepartments,
  );
  const isPending = accessMutation.isPending || invitationMutation.isPending;

  // Both prompts ride inside whichever sheet is on top, this one or the access
  // sheet that can raise the removal: iOS refuses a second Modal while a sheet
  // is up, so as siblings neither ever appeared.
  const confirmationOverlay = (
    <>
      <ConfirmationModal
        presentation="inline"
        body="They'll come off the management roster."
        confirmLabel="Remove access"
        error={error}
        confirmTone="danger"
        loading={accessMutation.isPending}
        onCancel={() => {
          setError(null);
          setShowRemoveConfirmation(false);
        }}
        onConfirm={() =>
          new Promise<void>((resolve) => {
            accessMutation.mutate({ remove: true }, { onSettled: () => resolve() });
          })
        }
        title={`Remove ${fullName} from management?`}
        visible={showRemoveConfirmation}
      />

      <ConfirmationModal
        presentation="inline"
        body={
          invitationConfirmAction === "resend"
            ? `The current invitation for ${displayed.email} will be canceled and a new one sent.`
            : `The current invite link for ${displayed.email} will stop working.`
        }
        confirmLabel={
          invitationConfirmAction === "resend" ? "Reissue Invitation" : "Revoke Invitation"
        }
        confirmTone={invitationConfirmAction === "revoke" ? "danger" : "primary"}
        error={error}
        loading={invitationMutation.isPending}
        onCancel={() => {
          setError(null);
          setInvitationConfirmAction(null);
        }}
        onConfirm={() => {
          if (invitationConfirmAction)
            return invitationMutation.mutateAsync(invitationConfirmAction);
        }}
        title={invitationConfirmAction === "resend" ? "Reissue invitation?" : "Revoke invitation?"}
        visible={invitationConfirmAction != null}
      />
    </>
  );

  return (
    <>
      <BottomSheetModal
        overlay={confirmationOverlay}
        footer={
          <>
            {error && !showAccessSheet && !showRoleSheet ? <InlineError message={error} /> : null}
            <SheetActions>
              {isPendingInvite ? (
                <Button
                  disabled={isPending}
                  label="Reinvite"
                  loading={invitationMutation.isPending}
                  onPress={() => setInvitationConfirmAction("resend")}
                  tone="secondary"
                />
              ) : null}
              <Button
                disabled={isPending}
                label="Edit management access"
                // Sequenced, not swapped: presenting the access sheet in the same
                // commit that dismisses this one is the case iOS refuses, and the
                // access sheet could come up unreachable behind a dead backdrop.
                onPress={() => {
                  setIsActionsHidden(true);
                  handoff(() => setShowAccessSheet(true));
                }}
                tone="secondary"
              />
              <Button
                disabled={isPending}
                label="Change access level"
                onPress={() => {
                  setIsActionsHidden(true);
                  handoff(() => setShowRoleSheet(true));
                }}
                tone="secondary"
              />
              <Button
                disabled={isPending}
                label={isPendingInvite ? "Revoke Invitation" : "Remove from Management"}
                onPress={() =>
                  isPendingInvite
                    ? setInvitationConfirmAction("revoke")
                    : setShowRemoveConfirmation(true)
                }
                tone="danger"
              />
            </SheetActions>
          </>
        }
        header={
          <SheetHeader
            subtitle={
              isPendingInvite
                ? `Invitation pending · ${displayed.email}`
                : displayed.email || "Management access only"
            }
            title={fullName}
          />
        }
        visible={managementUser != null && !isActionsHidden}
        onDismiss={onDismiss}
      >
        {/* One field, wrapped: the sheet body puts 16 between its direct
            children, which would break a label off from its own value. */}
        <View style={styles.field}>
          <AppText tone="secondary" variant="label">
            {MANAGEMENT_DEPARTMENT_LABELS.plural}
          </AppText>
          <AppText tone="muted">{departmentNames.join(", ") || "None"}</AppText>
        </View>
      </BottomSheetModal>

      <ManagementUserAccessSheet
        overlay={confirmationOverlay}
        // The access sheet is the surface that failed while it is open, so the
        // message belongs there rather than on the actions sheet behind it.
        error={showAccessSheet ? error : null}
        isPending={accessMutation.isPending}
        managementDepartments={managementDepartments}
        managementUser={displayed}
        onDismiss={() => {
          setShowAccessSheet(false);
          handoff(() => setIsActionsHidden(false));
        }}
        // Saving with no departments left means the same thing the Remove
        // button below means, so it raises the same prompt and the same
        // mutation rather than a second copy of either. Safe on top of the
        // access sheet, while the actions sheet underneath is hidden.
        onRemove={() =>
          isPendingInvite ? setInvitationConfirmAction("revoke") : setShowRemoveConfirmation(true)
        }
        onSubmit={(draft) =>
          new Promise<void>((resolve) => {
            accessMutation.mutate(draft, { onSettled: () => resolve() });
          })
        }
        visible={showAccessSheet}
      />

      {/* The role lives here rather than in the access sheet, so that sheet is
          the same departments editor a person with a profile gets. Someone on
          the roster with no profile has no badge to change it from, so this is
          their one route to it. */}
      <OrgRoleSheet
        error={showRoleSheet ? error : null}
        isPending={accessMutation.isPending}
        subject={{
          currentRole: displayed.orgRole ?? "user",
          invitationEmail: isPendingInvite ? displayed.email : null,
          displayName: fullName,
        }}
        visible={showRoleSheet}
        onDismiss={() => {
          setShowRoleSheet(false);
          handoff(() => setIsActionsHidden(false));
        }}
        onSubmit={(orgRole) =>
          new Promise<void>((resolve) => {
            accessMutation.mutate(
              { orgRole, managementDepartmentIds: displayed.managementDepartmentIds },
              { onSettled: () => resolve() },
            );
          })
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: mobileSpace.xs,
  },
});
