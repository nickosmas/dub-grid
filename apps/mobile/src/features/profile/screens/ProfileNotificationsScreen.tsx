import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Linking, StyleSheet, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { Text } from "../../../shared/components/Text";
import { AppSwitch } from "../../../shared/components/AppSwitch";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getProfileNotificationPreferences,
  saveProfileNotificationPreferences,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { mobileText, mobileTextWeighted, type MobileColors } from "../../../shared/theme/tokens";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { usePushRegistration } from "../../notifications/hooks/usePushRegistration";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategoryKey,
} from "../../notifications/lib/notification-categories";
import {
  ProfileList,
  ProfileNavRow,
  ProfilePanel,
  ProfileSection,
} from "../components/ProfilePrimitives";
import { ProfileSkeleton } from "../components/ProfileSkeleton";
import {
  NotificationCategorySheet,
  formatChannelSummary,
} from "../components/NotificationCategorySheet";

// The shared list, so these rows carry the names, glyphs and order the
// tour's permission step promised.
const CATEGORIES = NOTIFICATION_CATEGORIES;

type CategoryKey = NotificationCategoryKey;

type Channel = "in_app" | "email";

type PrefsShape = Record<CategoryKey, { in_app: boolean; email: boolean }>;

const DEFAULT_PREFS: PrefsShape = {
  schedule: { in_app: true, email: false },
  shift_requests: { in_app: true, email: false },
  system: { in_app: true, email: false },
};

function normalizePrefs(input: unknown): PrefsShape {
  const next: PrefsShape = {
    schedule: { ...DEFAULT_PREFS.schedule },
    shift_requests: { ...DEFAULT_PREFS.shift_requests },
    system: { ...DEFAULT_PREFS.system },
  };
  if (input && typeof input === "object") {
    const raw = input as Record<string, { in_app?: boolean; email?: boolean }>;
    for (const cat of CATEGORIES) {
      const entry = raw[cat.key];
      if (entry) {
        next[cat.key] = {
          in_app: entry.in_app ?? next[cat.key].in_app,
          email: entry.email ?? next[cat.key].email,
        };
      }
    }
  }
  return next;
}

export default function ProfileNotificationsScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap(accessToken);
  const [openCategoryKey, setOpenCategoryKey] = useState<CategoryKey | null>(null);
  const openCategory = CATEGORIES.find((cat) => cat.key === openCategoryKey) ?? null;
  const currentOrgId = bootstrap.data?.currentOrg?.id ?? null;
  const push = usePushRegistration(accessToken, currentOrgId, {
    autoRegister: false,
  });

  const prefsQuery = useQuery({
    queryKey: mobileQueryKeys.notificationPreferences(accessToken),
    enabled: Boolean(accessToken),
    queryFn: ({ signal }) => getProfileNotificationPreferences(accessToken!, signal),
  });

  // Derived from the query cache — never local state. The toggle handler
  // writes the new value to the cache BEFORE firing the mutation, so a
  // concurrent background refetch can't overwrite the user's in-progress
  // toggles with stale server data.
  const localPrefs = useMemo<PrefsShape>(
    () => normalizePrefs(prefsQuery.data?.prefs),
    [prefsQuery.data],
  );

  const manualRefresh = useManualRefresh(async () => {
    await prefsQuery.refetch();
  });

  const saveMutation = useMutation({
    mutationFn: async (next: PrefsShape) => {
      if (!accessToken) throw new Error("Not authenticated");
      return saveProfileNotificationPreferences(accessToken, next);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(mobileQueryKeys.notificationPreferences(accessToken), data);
    },
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not save preferences",
        fallbackMessage: "We couldn't save your notification preferences.",
      });
      // Revert by re-syncing from server.
      void prefsQuery.refetch();
    },
  });

  const togglePref = (category: CategoryKey, channel: Channel) => {
    const next: PrefsShape = {
      ...localPrefs,
      [category]: {
        ...localPrefs[category],
        [channel]: !localPrefs[category][channel],
      },
    };
    queryClient.setQueryData(mobileQueryKeys.notificationPreferences(accessToken), { prefs: next });
    saveMutation.mutate(next);
  };

  const togglePush = async () => {
    try {
      if (push.permissionState === "granted") {
        await push.disablePush();
      } else {
        await push.enablePush();
      }
    } catch (error) {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update push notifications",
        fallbackMessage: "We couldn't update your push notification setting.",
      });
    }
  };

  const contentState = useMobileContentState({
    hasData: Boolean(prefsQuery.data),
    isLoading: prefsQuery.isLoading,
    error: prefsQuery.error,
  });

  const pushSwitchEnabled = useMemo(
    () => push.isSupported && !push.isRegistering,
    [push.isRegistering, push.isSupported],
  );

  return (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      scrollEnabled={contentState.kind !== "loading"}
    >
      {contentState.kind === "loading" ? (
        contentState.showSkeleton ? (
          <ProfileSkeleton rowVariant="toggle" rowsPerSection={3} sections={2} showHero={false} />
        ) : null
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load preferences"
          variant="centered"
          onAction={() => {
            void prefsQuery.refetch();
          }}
        />
      ) : (
        <View style={styles.body}>
          <ProfileSection title="Push notifications">
            <ProfilePanel>
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.rowTitle}>Push to this device</Text>
                  <Text style={styles.rowDescription}>
                    {push.isSupported
                      ? push.permissionState === "denied"
                        ? "Notifications are off for DubGrid in your device settings."
                        : "Receive critical updates instantly even when the app isn't open."
                      : "Push notifications are not supported on this device."}
                  </Text>
                  {/* The OS will not ask again once denied, so the only way
                      forward is its settings page: offer it right here. */}
                  {push.isSupported && push.permissionState === "denied" ? (
                    <View style={styles.settingsLink}>
                      <Button
                        label="Open Settings"
                        onPress={() => {
                          void Linking.openSettings();
                        }}
                        size="sm"
                        tone="link"
                      />
                    </View>
                  ) : null}
                </View>
                <AppSwitch
                  accessibilityLabel="Push notifications"
                  disabled={!pushSwitchEnabled || push.permissionState === "denied"}
                  value={push.permissionState === "granted"}
                  onValueChange={() => {
                    void togglePush();
                  }}
                />
              </View>
            </ProfilePanel>
          </ProfileSection>

          <ProfileSection
            title="Categories"
            description="Choose how each kind of update reaches you."
          >
            <ProfileList>
              {CATEGORIES.map((cat, index) => (
                <ProfileNavRow
                  key={cat.key}
                  iconName={cat.icon}
                  isLast={index === CATEGORIES.length - 1}
                  label={cat.title}
                  value={formatChannelSummary(localPrefs[cat.key])}
                  onPress={() => setOpenCategoryKey(cat.key)}
                />
              ))}
            </ProfileList>
          </ProfileSection>
        </View>
      )}
      <NotificationCategorySheet
        category={
          openCategory
            ? {
                key: openCategory.key,
                label: openCategory.title,
                description: openCategory.detail,
                channels: localPrefs[openCategory.key],
              }
            : null
        }
        onDismiss={() => setOpenCategoryKey(null)}
        onToggle={(categoryKey, channel) => togglePref(categoryKey as CategoryKey, channel)}
      />
    </Screen>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    body: {
      gap: 16,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: 16,
    },
    toggleCopy: {
      flex: 1,
      gap: 4,
    },
    rowTitle: {
      ...mobileTextWeighted("cardTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    rowDescription: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
    settingsLink: {
      alignSelf: "flex-start",
    },
  });
