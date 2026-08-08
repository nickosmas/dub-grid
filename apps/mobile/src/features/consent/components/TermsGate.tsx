import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { acceptCurrentTerms } from "../../../shared/lib/api";
import { openInAppBrowser } from "../../../shared/lib/inAppBrowser";
import { handleExpiredMobileSession } from "../../../shared/lib/auth-reset";
import { getInlineErrorMessageOrToast } from "../../../shared/lib/errors";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { mobileText, type MobileColors } from "../../../shared/theme/tokens";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { getLegalUrls } from "../lib/consent";

const SHEET_BOTTOM_PADDING = Platform.OS === "ios" ? 40 : 24;

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
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
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
      <Modal
        animationType="fade"
        // Non-dismissable by back gesture — the only two ways out are the
        // Accept and Sign out buttons below.
        onRequestClose={() => {}}
        presentationStyle="overFullScreen"
        transparent
        visible={needsAcceptance}
      >
        <View style={styles.root}>
          <View accessibilityRole="alert" style={styles.sheet}>
            <View style={styles.copy}>
              <Text style={styles.title}>We've updated our Terms</Text>
              <Text style={styles.body}>
                Our Terms of Service have changed since you last accepted them. Please review and
                accept them to keep using DubGrid.
              </Text>
              <Pressable
                accessibilityRole="link"
                hitSlop={8}
                onPress={() => void openInAppBrowser(getLegalUrls().terms, mobileColors)}
              >
                <Text style={styles.link}>Read the Terms of Service</Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
            <View style={styles.actions}>
              <Button
                label="Accept and continue"
                loading={saving}
                onPress={() => void accept()}
                tone="primary"
              />
              {/* Declining has to be possible. The sheet covers the whole app,
                  so without this a user who won't accept has no way out of the
                  app at all — not even to reach the profile screen to sign out. */}
              <Button
                disabled={saving}
                label="Sign out"
                onPress={() => void handleExpiredMobileSession()}
                tone="ghost"
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: mobileColors.overlay,
    },
    sheet: {
      width: "100%",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: SHEET_BOTTOM_PADDING,
      gap: 20,
      shadowColor: mobileColors.textPrimary,
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
      shadowRadius: 28,
      elevation: 16,
    },
    copy: {
      gap: 8,
    },
    title: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    body: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    link: {
      ...mobileText.body,
      color: mobileColors.brand,
      fontWeight: "600",
      marginTop: 4,
    },
    error: {
      ...mobileText.meta,
      color: mobileColors.dangerText,
      marginTop: 4,
    },
    actions: {
      gap: 10,
    },
  });
