import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileText, type MobileColors } from "../../../shared/theme/tokens";
import { LEGAL_URLS, needsConsentDecision, setStoredConsent } from "../lib/consent";

const SHEET_BOTTOM_PADDING = Platform.OS === "ios" ? 40 : 24;

/**
 * Blocks first render with a cookie/analytics consent choice until the user
 * decides. Mirrors the web banner's binary model (essential vs. analytics).
 * Shown again only when the stored choice predates the current consent version.
 */
export function ConsentGate({ children }: PropsWithChildren) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  // null = still checking storage; once resolved we know whether to prompt.
  const [needsDecision, setNeedsDecision] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void needsConsentDecision().then((needed) => {
      if (active) setNeedsDecision(needed);
    });
    return () => {
      active = false;
    };
  }, []);

  async function choose(analytics: boolean) {
    setSaving(true);
    try {
      await setStoredConsent(analytics);
      setNeedsDecision(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {children}
      <Modal
        animationType="fade"
        // Non-dismissable: the user must make a choice. Re-prompt on hardware back.
        onRequestClose={() => {}}
        presentationStyle="overFullScreen"
        transparent
        visible={needsDecision === true}
      >
        <View style={styles.root}>
          <View accessibilityRole="alert" style={styles.sheet}>
            <View style={styles.copy}>
              <Text style={styles.title}>Your privacy</Text>
              <Text style={styles.body}>
                We use essential data to keep DubGrid working, including error monitoring. With your
                consent we also collect analytics to help us improve the app. You can change this
                any time in Profile, Privacy & data.
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(LEGAL_URLS.cookies)}
              >
                <Text style={styles.link}>Read our cookie policy</Text>
              </Pressable>
            </View>
            <View style={styles.actions}>
              <Button
                disabled={saving}
                label="Accept all"
                onPress={() => void choose(true)}
                tone="primary"
              />
              <Button
                disabled={saving}
                label="Essential only"
                onPress={() => void choose(false)}
                tone="secondary"
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
    actions: {
      gap: 10,
    },
  });
