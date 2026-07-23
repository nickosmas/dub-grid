import { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../shared/components/Button";
import { getScreenBottomPadding } from "../../../shared/components/screen-layout";
import { getOrgStatus } from "../../../shared/lib/api";
import { getMobileEnvConfig } from "../../../shared/lib/env";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpacing, mobileText, type MobileColors } from "../../../shared/theme/tokens";

function formatLockedMessage(message: string): string {
  return message.replace(/^Organization unavailable\.\s*/i, "").trim() || message;
}

function formatGraceDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// Real detail beyond the canned message the bootstrap 403 carries — the
// org-status route is the one place that returns billing state even when
// the org is locked, so this is progressive enhancement on top of `message`,
// not a replacement for it (falls back silently if the fetch fails).
function getDetailLine(status: {
  state: string;
  trialGraceEndsAt: string | null;
} | null): string | null {
  if (!status) return null;

  if (status.state === "suspended") {
    return "This organization was suspended by DubGrid staff.";
  }

  if (status.state === "locked") {
    return "Billing needs attention before this organization can be used again.";
  }

  if (!["trial_grace", "trial_ending_soon", "payment_attention_required"].includes(status.state)) {
    // The org looks fine now — a billing fix may have just landed.
    return "This organization may be available again — try reloading.";
  }

  return null;
}

export function OrganizationLockedScreen({
  accessToken = null,
  message,
  isRetrying = false,
  onRetry,
  onSignOut,
}: {
  accessToken?: string | null;
  message: string;
  isRetrying?: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const insets = useSafeAreaInsets();
  const body = formatLockedMessage(message);

  const statusQuery = useQuery({
    queryKey: ["mobile", "org-status", accessToken],
    queryFn: () => getOrgStatus(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
  });
  const status = statusQuery.data ?? null;
  const detailLine = getDetailLine(status);
  const graceDate = status?.state === "trial_grace" ? formatGraceDate(status.trialGraceEndsAt) : null;
  const isSuperAdmin = status?.orgRole === "super_admin";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: getScreenBottomPadding("stack", insets.bottom),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>DubGrid</Text>
          <Text style={styles.title}>Organization unavailable</Text>
          <Text style={styles.body}>{body}</Text>
          {detailLine ? <Text style={styles.detail}>{detailLine}</Text> : null}
          {graceDate ? (
            <Text style={styles.detail}>Grace period ends {graceDate}.</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button label="Try again" loading={isRetrying} onPress={onRetry} tone="primary" />
          {isSuperAdmin ? (
            <Button
              label="Manage billing on web"
              onPress={() => {
                void Linking.openURL(`${getMobileEnvConfig().apiBaseUrl}/settings?section=org-billing`);
              }}
              tone="secondary"
            />
          ) : null}
          <Button label="Sign out" onPress={onSignOut} tone="neutral" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (mobileColors: MobileColors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileColors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: mobileSpacing.sectionGap,
  },
  copy: {
    gap: mobileSpacing.cardGap,
  },
  eyebrow: {
    ...mobileText.label,
    color: mobileColors.brand,
    textTransform: "uppercase",
  },
  title: {
    ...mobileText.heroMetric,
    color: mobileColors.textPrimary,
  },
  body: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  detail: {
    ...mobileText.body,
    color: mobileColors.textSubtle,
  },
  actions: {
    gap: mobileSpacing.cardGap,
  },
});
