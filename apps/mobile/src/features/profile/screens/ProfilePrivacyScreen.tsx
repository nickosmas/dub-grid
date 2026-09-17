import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppSwitch } from "../../../shared/components/AppSwitch";
import { Screen } from "../../../shared/components/Screen";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { openInAppBrowser } from "../../../shared/lib/inAppBrowser";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileText,
  mobileTextWeighted,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
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
    <Screen bottomPaddingMode="tabbed">
      {/* "Analytics", not "Cookies & analytics": that title came over from the
          web consent banner, and a native app sets no cookies. `analytics` is
          the only user-controlled flag here (see consent.ts). The cookie policy
          still has a home below, under Policies, because it documents the site. */}
      <ProfileSection
        title="Analytics"
        description="Essential data keeps the app working, including error monitoring, and can't be turned off. Analytics is optional and helps us improve the app."
      >
        <ProfilePanel>
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleLabel}>Analytics</Text>
              <Text style={styles.toggleDescription}>
                Share anonymous usage data to help us improve the app.
              </Text>
            </View>
            <AppSwitch
              accessibilityLabel="Analytics consent"
              disabled={saving || analytics === null}
              value={analytics ?? false}
              onValueChange={(next) => void handleToggle(next)}
            />
          </View>
        </ProfilePanel>
      </ProfileSection>

      <ProfileSection title="Policies">
        <ProfileList>
          <ProfileNavRow
            iconName="lock-closed-outline"
            label="Privacy policy"
            onPress={() => openInAppBrowser(getLegalUrls().privacy, mobileColors)}
          />
          <ProfileNavRow
            iconName="document-text-outline"
            label="Terms of service"
            onPress={() => openInAppBrowser(getLegalUrls().terms, mobileColors)}
          />
          <ProfileNavRow
            iconName="information-circle-outline"
            isLast
            label="Cookie policy"
            onPress={() => openInAppBrowser(getLegalUrls().cookies, mobileColors)}
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
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    toggleLabel: {
      ...mobileTextWeighted("cardTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    toggleDescription: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
  });
