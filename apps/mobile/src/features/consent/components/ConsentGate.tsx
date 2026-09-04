import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Keyboard } from "react-native";
import { Button } from "../../../shared/components/Button";
import {
  BottomSheetModal,
  SheetActions,
  SheetCopy,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { openInAppBrowser } from "../../../shared/lib/inAppBrowser";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { getLegalUrls, needsConsentDecision, setStoredConsent } from "../lib/consent";

const ConsentDecisionPendingContext = createContext(false);

/**
 * True until the user's consent choice is known: while it is still being read
 * from storage, and while the sheet is up waiting for an answer.
 *
 * The gate renders the app behind its sheet, so a screen mounting underneath
 * can't tell that something is about to take over the display. Screens read
 * this to hold back anything that would fight the sheet for attention —
 * above all, focusing a field, which raises the keyboard over it.
 */
export function useIsConsentDecisionPending() {
  return useContext(ConsentDecisionPendingContext);
}

const RecheckConsentDecisionContext = createContext<() => void>(() => {});

/**
 * Re-reads the stored decision and re-opens the sheet if there no longer is
 * one. The gate reads storage once at mount, so anything that clears consent
 * on a running app (the dev first-run reset) has to say so.
 */
export function useRecheckConsentDecision() {
  return useContext(RecheckConsentDecisionContext);
}

/**
 * Blocks first render with a cookie/analytics consent choice until the user
 * decides. Mirrors the web banner's binary model (essential vs. analytics).
 * Shown again only when the stored choice predates the current consent version.
 */
export function ConsentGate({ children }: PropsWithChildren) {
  const mobileColors = useMobileColors();
  // null = still checking storage; once resolved we know whether to prompt.
  const [needsDecision, setNeedsDecision] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyDecision = useCallback((needed: boolean) => {
    // The storage read resolves after the screen behind is interactive, so a
    // field there can already hold focus (typically login). An iOS modal
    // doesn't resign the presenting window's first responder, which would
    // leave the keyboard up covering this sheet, with a still-active text
    // field competing for the same taps.
    if (needed) Keyboard.dismiss();
    setNeedsDecision(needed);
  }, []);

  useEffect(() => {
    let active = true;
    void needsConsentDecision().then((needed) => {
      if (active) applyDecision(needed);
    });
    return () => {
      active = false;
    };
  }, [applyDecision]);

  const recheckDecision = useCallback(() => {
    void needsConsentDecision().then(applyDecision);
  }, [applyDecision]);

  async function choose(analytics: boolean) {
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      await setStoredConsent(analytics);
      setNeedsDecision(false);
    } catch {
      // Device storage refused the write. Without this the rejection was
      // swallowed by the `void` at the call site and `needsDecision` stayed
      // true, so the user sat behind a sheet that cannot be dismissed with two
      // buttons that appeared to do nothing at all. Say so, and let them retry.
      setError("We couldn't save your choice on this device. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RecheckConsentDecisionContext.Provider value={recheckDecision}>
        <ConsentDecisionPendingContext.Provider value={needsDecision !== false}>
          {children}
        </ConsentDecisionPendingContext.Provider>
      </RecheckConsentDecisionContext.Provider>
      {/* `dismissDisabled` is what makes this blocking: it disables the drag,
          the outside tap and the Android back gesture in one place, so the user
          has to answer with one of the two buttons. */}
      <BottomSheetModal
        accessibilityRole="alert"
        dismissDisabled
        header={<SheetHeader title="Your privacy" />}
        onDismiss={() => {}}
        visible={needsDecision === true}
      >
        <SheetCopy
          body="We use essential data to keep DubGrid working, including error monitoring. With your consent we also collect analytics to help us improve the app. You can change this any time in Profile, Privacy & data."
          error={error}
          linkLabel="Read our cookie policy"
          // In-app: leaving for Safari mid-decision would drop the user out of
          // a sheet they still have to answer.
          onLinkPress={() => void openInAppBrowser(getLegalUrls().cookies, mobileColors)}
        />
        <SheetActions>
          {/* Returning the promise is what latches the button against a second
              tap. `void`-ing it left `useAsyncAction` with nothing to await, so
              the only guard was a state flag that lands a render too late. */}
          <Button
            disabled={saving}
            label="Accept all"
            loading={saving}
            onPress={() => choose(true)}
            tone="primary"
          />
          <Button
            disabled={saving}
            label="Essential only"
            onPress={() => choose(false)}
            tone="secondary"
          />
        </SheetActions>
      </BottomSheetModal>
    </>
  );
}
