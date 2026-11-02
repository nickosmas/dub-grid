import { useState } from "react";
import {
  buildInitialPermissions,
  countPermissionLevels,
  type PermissionEditorLabels,
} from "@dubgrid/authz";
import type { AdminPermissions } from "@dubgrid/domain";
import {
  ProfileList,
  ProfileNavRow,
  ProfileSection,
} from "../../profile/components/ProfilePrimitives";
import { PermissionsSheet } from "./PermissionsSheet";

/**
 * An Admin invite's permissions, chosen before it goes out. Opens the same
 * Permissions sheet the person page uses, over the invite sheet, and keeps the
 * choice here until the invite is sent. Null means the standard Admin set.
 */
export function InvitePermissionsRow({
  personName,
  labels,
  value,
  onChange,
}: {
  personName: string;
  labels: PermissionEditorLabels;
  value: AdminPermissions | null;
  onChange: (permissions: AdminPermissions) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = countPermissionLevels(buildInitialPermissions(value));

  return (
    <>
      <ProfileSection>
        <ProfileList>
          <ProfileNavRow
            iconName="shield-checkmark-outline"
            isLast
            label="Permissions"
            value={`${count.enabled} of ${count.total}`}
            onPress={() => setOpen(true)}
          />
        </ProfileList>
      </ProfileSection>
      <PermissionsSheet
        isPending={false}
        labels={labels}
        onDismiss={() => setOpen(false)}
        onSave={(next) => {
          onChange(next);
          setOpen(false);
        }}
        personName={personName}
        stored={value}
        visible={open}
      />
    </>
  );
}
