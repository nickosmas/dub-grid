import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ComponentProps } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getProfileNotificationPreferences,
  saveProfileNotificationPreferences,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { mobileText, mobileTextWeighted, type MobileColors } from "../../../shared/theme/tokens";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { usePushRegistration } from "../../notifications/hooks/usePushRegistration";
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

const CATEGORIES = [
  {
    key: "schedule",
    label: "Schedule updates",
    description: "When a schedule is published or one of your shifts changes.",
  },
  {
    key: "shift_requests",
    label: "Shift requests",
    description: "New requests to approve and updates on your own pickup/swap requests.",
  },
  {
    key: "system",
    label: "System & account",
    description: "Account-level activity such as role changes and impersonation alerts.",
  },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** One glyph per category, so the rows are told apart by shape as well as text. */
const CATEGORY_ICONS: Record<CategoryKey, ComponentProps<typeof Ionicons>["name"]> = {
  schedule: "calendar-outline",
  shift_requests: "swap-horizontal-outline",
  system: "settings-outline",
};

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
    queryKey: ["mobile", "notification-preferences", accessToken],
    enabled: Boolean(accessToken),
    queryFn: () => getProfileNotificationPreferences(accessToken!),
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
      queryClient.setQueryData(["mobile", "notification-preferences", accessToken], data);
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
    queryClient.setQueryData(["mobile", "notification-preferences", accessToken], { prefs: next });
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
                        ? "Permission was denied. Enable it from your device settings."
                        : "Receive critical updates instantly even when DubGrid isn't open."
                      : "Push notifications are not supported on this device."}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Push notifications"
                  disabled={!pushSwitchEnabled || push.permissionState === "denied"}
                  ios_backgroundColor={mobileColors.border}
                  thumbColor={mobileColors.surface}
                  trackColor={{ false: mobileColors.border, true: mobileColors.brand }}
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
                  iconName={CATEGORY_ICONS[cat.key]}
                  isLast={index === CATEGORIES.length - 1}
                  label={cat.label}
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
                label: openCategory.label,
                description: openCategory.description,
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
  });
