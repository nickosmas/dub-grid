import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Keyboard } from "react-native";
import { router, usePathname } from "expo-router";
import { Button } from "../../../shared/components/Button";
import {
  BottomSheetModal,
  SheetActions,
  SheetCopy,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { handleExpiredMobileSession } from "../../../shared/lib/auth-reset";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useBootstrap } from "../hooks/useBootstrap";

const TWO_FACTOR_PATH = "/profile/two-factor";

/**
 * After DubGrid support resets someone's two-factor, holds the app until they
 * enroll again, like the web gate. It stands aside on the two-factor screen
 * and asks bootstrap again when they leave it. The flag comes from bootstrap,
 * which defaults to not required, so a stale server never holds anyone here.
 */
export function TwoFactorReenrollGate({ children }: PropsWithChildren) {
  const { accessToken } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const onTwoFactorScreen = pathname === TWO_FACTOR_PATH;
  const required = bootstrapQuery.data?.mfaReenrollRequired === true;
  // Terms come first: two gate sheets at once is a pair iOS refuses.
  const termsPending = bootstrapQuery.data?.acceptedCurrentTerms === false;
  const wasOnTwoFactorScreen = useRef(onTwoFactorScreen);
  // Held while bootstrap re-checks after they leave the two-factor screen, so
  // the gate does not flash back up over a finished enrollment.
  const [rechecking, setRechecking] = useState(false);

  useEffect(() => {
    if (wasOnTwoFactorScreen.current && !onTwoFactorScreen && required) {
      setRechecking(true);
      void queryClient
        .invalidateQueries({ queryKey: ["mobile", "bootstrap"] })
        .catch(() => undefined)
        .finally(() => setRechecking(false));
    }
    wasOnTwoFactorScreen.current = onTwoFactorScreen;
  }, [onTwoFactorScreen, required, queryClient]);

  const visible = required && !termsPending && !onTwoFactorScreen && !rechecking;

  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  return (
    <>
      {children}
      <BottomSheetModal
        presentationKind="gate"
        accessibilityRole="alert"
        dismissDisabled
        footer={
          <SheetActions
            primaryAction={
              <Button
                label="Set up two-factor"
                onPress={() => router.push("/(tabs)/profile/two-factor")}
                tone="primary"
              />
            }
          >
            <Button label="Sign out" onPress={() => handleExpiredMobileSession()} tone="neutral" />
          </SheetActions>
        }
        header={<SheetHeader title="Set up two-factor again" />}
        onDismiss={() => {}}
        visible={visible}
      >
        <SheetCopy body="DubGrid support reset two-factor sign-in on your account. Set up an authenticator app to keep using DubGrid." />
      </BottomSheetModal>
    </>
  );
}
