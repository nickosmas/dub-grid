import type { MobileProfileSession } from "@dubgrid/contracts";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { ProfileInfoRow, ProfileList } from "./ProfilePrimitives";
import {
  formatSessionDeviceLabel,
  formatSessionClient,
  formatSessionLocation,
  formatSessionPlatform,
  formatSessionTimestamp,
} from "./session-format";

/**
 * Everything known about one signed-in device, plus the way to sign it out.
 *
 * The list row used to carry all of this at once — label, Current badge,
 * last-active line, an `appVersion - ipAddress` meta line and a Revoke button —
 * which left every row cramped and the revoke button sitting one mis-tap away
 * from a scroll. The row now carries a name and a timestamp; the rest lives
 * here, where there is room to label each value.
 */
export function SessionDetailSheet({
  session,
  revoking,
  onDismiss,
  onRevoke,
}: {
  /** `null` closes the sheet — the sheet owns no copy of the session. */
  session: MobileProfileSession | null;
  revoking: boolean;
  onDismiss: () => void;
  onRevoke: (session: MobileProfileSession) => void;
}) {
  return (
    <BottomSheetModal
      header={
        <SheetHeader
          subtitle={session?.isCurrent ? "This device" : undefined}
          title={session ? formatSessionDeviceLabel(session) : "Device"}
        />
      }
      scrollable
      visible={session != null}
      onDismiss={onDismiss}
    >
      {session ? (
        <>
          <ProfileList>
            <ProfileInfoRow
              iconName="phone-portrait-outline"
              label="Platform"
              value={formatSessionPlatform(session.platform)}
            />
            <ProfileInfoRow
              iconName="cube-outline"
              label={session.platform === "web" ? "Browser" : "App"}
              value={formatSessionClient(session)}
            />
            <ProfileInfoRow
              iconName="globe-outline"
              label="IP address"
              value={formatSessionLocation(session)}
            />
            <ProfileInfoRow
              iconName="log-in-outline"
              label="First signed in"
              value={formatSessionTimestamp(session.createdAt)}
            />
            <ProfileInfoRow
              iconName="time-outline"
              isLast
              label="Last active"
              value={formatSessionTimestamp(session.lastActiveAt)}
            />
          </ProfileList>
          {/* Every device gets the same button, this one included: a sheet that
              lists what a device is and then offers no way to end it sends the
              user hunting through the bulk sheet for the one scope that also
              signs out everything else. */}
          <SheetActions>
            <Button
              label="Sign out this device"
              loading={revoking}
              onPress={() => onRevoke(session)}
              tone="danger"
            />
          </SheetActions>
        </>
      ) : null}
    </BottomSheetModal>
  );
}
