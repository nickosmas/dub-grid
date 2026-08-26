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
          {/* Signing this device out from its own detail sheet would drop the
              user mid-flow with a sheet still open. The bulk sheet's "Sign out
              everywhere" is the deliberate way to do that. */}
          {session.isCurrent ? null : (
            <SheetActions>
              <Button
                label="Sign out this device"
                loading={revoking}
                loadingLabel="Signing out"
                onPress={() => onRevoke(session)}
                tone="danger"
              />
            </SheetActions>
          )}
        </>
      ) : null}
    </BottomSheetModal>
  );
}
