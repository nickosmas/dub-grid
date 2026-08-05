import { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import { Screen } from "../../../shared/components/Screen";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileText, type MobileColors } from "../../../shared/theme/tokens";
import { getLegalUrls, getStoredConsent, setStoredConsent } from "../../consent/lib/consent";
import {
  ProfileList,
  ProfileNavRow,
  ProfilePanel,
  ProfileSection,
} from "../components/ProfilePrimitives";

export default function ProfilePrivacyScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { pushToast } = useToast();
  // null until the stored consent is read. Defaulting to `false` rendered the
  // switch off and then visibly flipped it on for anyone who had opted in.
  const [analytics, setAnalytics] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getStoredConsent().then((consent) => {
      if (active) setAnalytics(consent?.analytics ?? false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleToggle(next: boolean) {
    const previous = analytics;
    setAnalytics(next);
    setSaving(true);
    try {
      await setStoredConsent(next);
    } catch (error) {
      // Roll the switch back rather than leaving it showing a choice we never
      // persisted.
      setAnalytics(previous);
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not save preference",
        fallbackMessage: "We couldn't save that preference. Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen bottomPaddingMode="tabbed" title="Privacy & data" subtitle="Privacy & data">
      <ProfileSection
        title="Cookies & analytics"
        description="Essential data keeps DubGrid working, including error monitoring, and can't be turned off. Analytics is optional and helps us improve the app."
      >
        <ProfilePanel>
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleLabel}>Analytics</Text>
              <Text style={styles.toggleDescription}>
                Share anonymous usage data to help us improve DubGrid.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Analytics consent"
              disabled={saving || analytics === null}
              ios_backgroundColor={mobileColors.border}
              onValueChange={(next) => void handleToggle(next)}
              thumbColor={mobileColors.surface}
              trackColor={{ false: mobileColors.border, true: mobileColors.brand }}
              value={analytics ?? false}
            />
          </View>
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Policies">
        <ProfileList>
          <ProfileNavRow
            iconName="lock-closed-outline"
            label="Privacy policy"
            onPress={() => void Linking.openURL(getLegalUrls().privacy)}
          />
          <ProfileNavRow
            iconName="document-text-outline"
            label="Terms of service"
            onPress={() => void Linking.openURL(getLegalUrls().terms)}
          />
          <ProfileNavRow
            iconName="information-circle-outline"
            isLast
            label="Cookie policy"
            onPress={() => void Linking.openURL(getLegalUrls().cookies)}
          />
        </ProfileList>
      </ProfileSection>
    </Screen>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    toggleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    toggleCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    toggleLabel: {
      ...mobileText.cardTitle,
      color: mobileColors.textPrimary,
      fontWeight: "500",
    },
    toggleDescription: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
  });
