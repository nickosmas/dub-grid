import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Screen } from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { DetailSkeleton } from "../../../shared/components/Skeleton";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import {
  getProfileNotificationPreferences,
  saveProfileNotificationPreferences,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import {
  mobileColors,
  mobileRadii,
  mobileText,
} from "../../../shared/theme/tokens";
import { useToast } from "../../../shared/providers/ToastProvider";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { usePushRegistration } from "../../notifications/hooks/usePushRegistration";
import {
  ProfilePanel,
  ProfileSection,
} from "../components/ProfilePrimitives";

const CATEGORIES = [
  {
    key: "schedule",
    label: "Schedule updates",
    description:
      "When a schedule is published or one of your shifts changes.",
  },
  {
    key: "shift_requests",
    label: "Shift requests",
    description:
      "New requests to approve and updates on your own pickup/swap requests.",
  },
  {
    key: "system",
    label: "System & account",
    description:
      "Account-level activity such as role changes and impersonation alerts.",
  },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

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
  const accessToken = useAccessToken();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap(accessToken);
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
      queryClient.setQueryData(
        ["mobile", "notification-preferences", accessToken],
        data,
      );
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
    queryClient.setQueryData(
      ["mobile", "notification-preferences", accessToken],
      { prefs: next },
    );
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

  const contentState = getMobileQueryContentState({
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
      bottomPaddingMode="stack"
      title="Notifications"
      subtitle="Notifications"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
    >
      {contentState.kind === "loading" ? (
        <DetailSkeleton />
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          title="Could not load preferences"
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
                  disabled={
                    !pushSwitchEnabled || push.permissionState === "denied"
                  }
                  value={push.permissionState === "granted"}
                  onValueChange={() => {
                    void togglePush();
                  }}
                />
              </View>
            </ProfilePanel>
          </ProfileSection>

          <ProfileSection title="Categories">
            <ProfilePanel>
              {CATEGORIES.map((cat, idx) => (
                <View
                  key={cat.key}
                  style={[
                    styles.categoryBlock,
                    idx < CATEGORIES.length - 1 && styles.categoryDivider,
                  ]}
                >
                  <Text style={styles.rowTitle}>{cat.label}</Text>
                  <Text style={styles.rowDescription}>{cat.description}</Text>
                  <View style={styles.channelRow}>
                    <ChannelToggle
                      icon="phone-portrait-outline"
                      label="In-app"
                      value={localPrefs[cat.key].in_app}
                      onValueChange={() => togglePref(cat.key, "in_app")}
                    />
                    <ChannelToggle
                      icon="mail-outline"
                      label="Email"
                      value={localPrefs[cat.key].email}
                      onValueChange={() => togglePref(cat.key, "email")}
                    />
                  </View>
                </View>
              ))}
            </ProfilePanel>
          </ProfileSection>

          {saveMutation.isPending ? (
            <Text style={styles.savingNote}>Saving…</Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

interface ChannelToggleProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: boolean;
  onValueChange: () => void;
}

function ChannelToggle({
  icon,
  label,
  value,
  onValueChange,
}: ChannelToggleProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={onValueChange}
      style={styles.channelChip}
    >
      <Ionicons name={icon} size={16} color={mobileColors.textPrimary} />
      <Text style={styles.channelLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    ...mobileText.cardTitle,
    color: mobileColors.textPrimary,
    fontWeight: "500",
  },
  rowDescription: {
    ...mobileText.caption,
    color: mobileColors.textMuted,
  },
  categoryBlock: {
    padding: 16,
    gap: 8,
  },
  categoryDivider: {
    borderBottomWidth: 1,
    borderBottomColor: mobileColors.borderSubtle,
  },
  channelRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 6,
  },
  channelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.control,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  channelLabel: {
    ...mobileText.label,
    color: mobileColors.textPrimary,
    fontWeight: "500",
  },
  savingNote: {
    ...mobileText.caption,
    color: mobileColors.textMuted,
    textAlign: "center",
    paddingVertical: 4,
  },
});
