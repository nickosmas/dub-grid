import { useState } from "react";
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
import { OrgRoleChoice } from "./OrgRoleChoice";
import type { OrgRole } from "./OrgRoleSheet";

/**
 * Sends someone on the roster an invite to the app, with the access role it
 * grants. The address is the one on their profile; with none, the page offers
 * no Send, so this sheet never asks for one.
 */
export function PersonInviteSheet({
  visible,
  personName,
  email,
  canGrantSuperAdmin,
  isPending,
  error,
  onDismiss,
  onSend,
}: {
  visible: boolean;
  personName: string;
  email: string;
  canGrantSuperAdmin: boolean;
  isPending: boolean;
  error?: string | null;
  onDismiss: () => void;
  onSend: (orgRole: OrgRole) => Promise<unknown> | void;
}) {
  const [orgRole, setOrgRole] = useState<OrgRole>("user");
  const [wasVisible, setWasVisible] = useState(visible);

  // Each opening starts from User, the way Add person does.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOrgRole("user");
  }

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
                onPress={() => onSend(orgRole)}
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
        canGrantSuperAdmin={canGrantSuperAdmin}
        disabled={isPending}
        value={orgRole}
        onChange={setOrgRole}
      />
    </BottomSheetModal>
  );
}
