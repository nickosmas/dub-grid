import { useState } from "react";
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
import {
  removeMobileManagementUser,
  updateMobileManagementUser,
  updateMobileManagementUserInvitation,
} from "../../../shared/lib/api";
import { getDepartmentNames, MANAGEMENT_DEPARTMENT_LABELS } from "../../../shared/lib/departments";
import { mobileSpace } from "../../../shared/theme/tokens";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
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
  const [showAccessSheet, setShowAccessSheet] = useState(false);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
  const [invitationConfirmAction, setInvitationConfirmAction] =
    useState<InvitationConfirmAction>(null);

  function invalidateRoster() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "management-users"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "people"] }),
    ]);
  }

  function closeEverything() {
    setShowAccessSheet(false);
    setShowRemoveConfirmation(false);
    setInvitationConfirmAction(null);
    onDismiss();
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
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update management access",
        fallbackMessage: "We couldn't update their management access right now.",
      });
    },
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
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update invitation",
        fallbackMessage: "We couldn't update that invitation right now.",
      });
    },
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

  if (!managementUser) return null;

  const fullName = getFullName(managementUser);
  const isPendingInvite = managementUser.source === "pending_invite";
  const departmentNames = getDepartmentNames(
    managementUser.managementDepartmentIds,
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
                ? `Invitation pending · ${managementUser.email}`
                : managementUser.email || "Management access only"
            }
            title={fullName}
          />
        }
        visible={!showAccessSheet}
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

        <SheetActions>
          {isPendingInvite ? (
            <Button
              disabled={isPending}
              label="Reinvite"
              loading={invitationMutation.isPending}
              loadingLabel="Sending"
              onPress={() => setInvitationConfirmAction("resend")}
              tone="primary"
            />
          ) : null}
          <Button
            disabled={isPending}
            label="Edit Management Access"
            onPress={() => setShowAccessSheet(true)}
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
        isPending={accessMutation.isPending}
        managementDepartments={managementDepartments}
        managementUser={managementUser}
        onDismiss={() => setShowAccessSheet(false)}
        onSubmit={(draft) => accessMutation.mutate(draft)}
        visible={showAccessSheet}
      />

      <ConfirmationModal
        body="They'll come off the management roster."
        confirmLabel="Remove Access"
        confirmPendingLabel="Removing"
        confirmTone="danger"
        loading={accessMutation.isPending}
        onCancel={() => setShowRemoveConfirmation(false)}
        onConfirm={() => accessMutation.mutate({ remove: true })}
        title={`Remove ${fullName} from management?`}
        visible={showRemoveConfirmation}
      />

      <ConfirmationModal
        body={
          invitationConfirmAction === "resend"
            ? `The current invitation for ${managementUser.email} will be canceled and a new one sent.`
            : `The current invite link for ${managementUser.email} will stop working.`
        }
        confirmLabel={
          invitationConfirmAction === "resend" ? "Reissue Invitation" : "Revoke Invitation"
        }
        confirmTone={invitationConfirmAction === "revoke" ? "danger" : "primary"}
        loading={invitationMutation.isPending}
        onCancel={() => setInvitationConfirmAction(null)}
        onConfirm={() => {
          if (invitationConfirmAction) invitationMutation.mutate(invitationConfirmAction);
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
