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
    onSuccess: async (result) => {
      // Closed either way: the roster behind this sheet is what shows the
      // result, and a sheet left open over it would be showing the old row.
      closeEverything();
      await invalidateRoster();
      pushToast({
        tone: "success",
        title:
          result.result === "access_removed"
            ? "Management access removed"
            : "Management access updated",
        message: "Their management access was updated.",
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

  return (
    <>
      <BottomSheetModal
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

        {error && !showAccessSheet ? <InlineError message={error} /> : null}

        <SheetActions>
          {isPendingInvite ? (
            <Button
              disabled={isPending}
              label="Reinvite"
              loading={invitationMutation.isPending}
              onPress={() => setInvitationConfirmAction("resend")}
              tone="primary"
            />
          ) : null}
          <Button
            disabled={isPending}
            label="Edit Management Access"
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
            label={isPendingInvite ? "Revoke Invitation" : "Remove from Management"}
            onPress={() =>
              isPendingInvite
                ? setInvitationConfirmAction("revoke")
                : setShowRemoveConfirmation(true)
            }
            tone="danger"
          />
          <Button disabled={isPending} label="Cancel" onPress={onDismiss} tone="neutral" />
        </SheetActions>
      </BottomSheetModal>

      <ManagementUserAccessSheet
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
        onSubmit={(draft) =>
          new Promise<void>((resolve) => {
            accessMutation.mutate(draft, { onSettled: () => resolve() });
          })
        }
        visible={showAccessSheet}
      />

      <ConfirmationModal
        body="They'll come off the management roster."
        confirmLabel="Remove Access"
        confirmTone="danger"
        loading={accessMutation.isPending}
        onCancel={() => setShowRemoveConfirmation(false)}
        onConfirm={() =>
          new Promise<void>((resolve) => {
            accessMutation.mutate({ remove: true }, { onSettled: () => resolve() });
          })
        }
        title={`Remove ${fullName} from management?`}
        visible={showRemoveConfirmation}
      />

      <ConfirmationModal
        body={
          invitationConfirmAction === "resend"
            ? `The current invitation for ${displayed.email} will be canceled and a new one sent.`
            : `The current invite link for ${displayed.email} will stop working.`
        }
        confirmLabel={
          invitationConfirmAction === "resend" ? "Reissue Invitation" : "Revoke Invitation"
        }
        confirmTone={invitationConfirmAction === "revoke" ? "danger" : "primary"}
        loading={invitationMutation.isPending}
        onCancel={() => setInvitationConfirmAction(null)}
        onConfirm={() => {
          if (invitationConfirmAction)
            return invitationMutation.mutateAsync(invitationConfirmAction);
        }}
        title={invitationConfirmAction === "resend" ? "Reissue invitation?" : "Revoke invitation?"}
        visible={invitationConfirmAction != null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: mobileSpace.xs,
  },
});
