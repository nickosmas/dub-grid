import { useState } from "react";
import type { PermissionEditorLabels } from "@dubgrid/authz";
import type { AdminPermissions } from "@dubgrid/domain";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { InlineError } from "../../../shared/components/InlineError";
import {
  ProfileInfoRow,
  ProfileList,
  ProfileSection,
} from "../../profile/components/ProfilePrimitives";
import { InvitePermissionsRow } from "./InvitePermissionsRow";
import { OrgRoleChoice } from "./OrgRoleChoice";
import type { OrgRole } from "./OrgRoleSheet";

/**
 * Sends someone on the roster an invite to the app, with the access role it
 * grants and, for an Admin invited by a Super Admin, their permissions. The
 * address is the one on their profile; with none, the page offers no Send, so
 * this sheet never asks for one.
 */
export function PersonInviteSheet({
  visible,
  personName,
  email,
  canGrantElevatedRoles,
  permissionLabels,
  isPending,
  error,
  onDismiss,
  onSend,
}: {
  visible: boolean;
  personName: string;
  email: string;
  /** A Super Admin, who alone grants Super Admin and sets an Admin's permissions. */
  canGrantElevatedRoles: boolean;
  permissionLabels: PermissionEditorLabels;
  isPending: boolean;
  error?: string | null;
  onDismiss: () => void;
  onSend: (orgRole: OrgRole, adminPermissions: AdminPermissions | null) => Promise<unknown> | void;
}) {
  const [orgRole, setOrgRole] = useState<OrgRole>("user");
  const [permissions, setPermissions] = useState<AdminPermissions | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  // Each opening starts from User, the way Add person does.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setOrgRole("user");
      setPermissions(null);
    }
  }
  const setsPermissions = canGrantElevatedRoles && orgRole === "admin";

  return (
    <BottomSheetModal
      footer={
        <>
          {error ? <InlineError message={error} /> : null}
          <SheetActions
            primaryAction={
              <Button
                disabled={isPending}
                label="Send"
                loading={isPending}
                onPress={() => onSend(orgRole, setsPermissions ? permissions : null)}
              />
            }
          >
            <Button disabled={isPending} label="Cancel" onPress={onDismiss} tone="neutral" />
          </SheetActions>
        </>
      }
      header={<SheetHeader subtitle={personName} title="Invite to the app" />}
      scrollable
      visible={visible}
      onDismiss={onDismiss}
    >
      <ProfileSection>
        <ProfileList>
          <ProfileInfoRow iconName="mail-outline" isLast label="Sends to" value={email} />
        </ProfileList>
      </ProfileSection>
      <OrgRoleChoice
        canGrantElevatedRoles={canGrantElevatedRoles}
        disabled={isPending}
        value={orgRole}
        onChange={setOrgRole}
      />
      {setsPermissions ? (
        <InvitePermissionsRow
          labels={permissionLabels}
          onChange={setPermissions}
          personName={personName}
          value={permissions}
        />
      ) : null}
    </BottomSheetModal>
  );
}
