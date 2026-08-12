import { useEffect, useState, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Keyboard } from "react-native";
import { Button } from "../../../shared/components/Button";
import {
  BottomSheetModal,
  SheetActions,
  SheetCopy,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { acceptCurrentTerms } from "../../../shared/lib/api";
import { openInAppBrowser } from "../../../shared/lib/inAppBrowser";
import { handleExpiredMobileSession } from "../../../shared/lib/auth-reset";
import { getInlineErrorMessageOrToast } from "../../../shared/lib/errors";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { getLegalUrls } from "../lib/consent";

/**
 * Blocks the authenticated app until the signed-in user has accepted the
 * current Terms of Service version.
 *
 * Web enforces this at login (`/api/auth/login` redirects to `/accept-terms`).
 * Mobile signs in through its own endpoint, so without this gate a
 * mobile-only user would never be re-prompted when `CURRENT_TERMS_VERSION`
 * is bumped. The flag itself comes from bootstrap, which defaults to accepted
 * so a stale server response can never lock anyone out.
 */
export function TermsGate({ children }: PropsWithChildren) {
  const mobileColors = useMobileColors();
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only gate once bootstrap has actually answered — never on a loading or
  // errored state, which would strand the user behind an un-acceptable sheet.
  const needsAcceptance = bootstrapQuery.data?.acceptedCurrentTerms === false;

  // Same reason as ConsentGate: this gate opens on an async answer, so a field
  // on the screen behind may still hold focus, and an iOS modal leaves that
  // window's keyboard up on top of the sheet.
  useEffect(() => {
    if (needsAcceptance) Keyboard.dismiss();
  }, [needsAcceptance]);

  async function accept() {
    if (!accessToken || saving) return;

    setSaving(true);
    setError(null);
    try {
      await acceptCurrentTerms(accessToken);
      await queryClient.invalidateQueries({ queryKey: ["mobile", "bootstrap"] });
    } catch (acceptError) {
      setError(
        getInlineErrorMessageOrToast(pushToast, {
          error: acceptError,
          fallbackMessage: "We couldn't record your acceptance. Try again in a moment.",
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {children}
      {/* `dismissDisabled` is what makes this blocking: it disables the drag,
          the outside tap and the Android back gesture in one place, so the only
          ways out are the two buttons below. */}
      <BottomSheetModal
        accessibilityRole="alert"
        dismissDisabled
        header={<SheetHeader title="We've updated our Terms" />}
        onDismiss={() => {}}
        visible={needsAcceptance}
      >
        <SheetCopy
          body="Our Terms of Service have changed since you last accepted them. Please review and accept them to keep using DubGrid."
          error={error}
          linkLabel="Read the Terms of Service"
          onLinkPress={() => void openInAppBrowser(getLegalUrls().terms, mobileColors)}
        />
        <SheetActions>
          <Button
            label="Accept and continue"
            loading={saving}
            onPress={() => void accept()}
            tone="primary"
          />
          {/* Declining has to be possible. The sheet covers the whole app, so
              without this a user who won't accept has no way out of the app at
              all — not even to reach the profile screen to sign out. */}
          <Button
            disabled={saving}
            label="Sign out"
            onPress={() => void handleExpiredMobileSession()}
            tone="ghost"
          />
        </SheetActions>
      </BottomSheetModal>
    </>
  );
}
