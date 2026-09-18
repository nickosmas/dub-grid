import { ActionButtons } from "../../../shared/components/ActionButtons";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../shared/components/Button";
import { getScreenBottomPadding } from "../../../shared/components/screen-layout";
import { getOrgStatus } from "../../../shared/lib/api";
import { getMobileEnvConfig } from "../../../shared/lib/env";
import { openInAppBrowser } from "../../../shared/lib/inAppBrowser";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
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
function getDetailLine(
  status: {
    state: string;
    trialGraceEndsAt: string | null;
  } | null,
): string | null {
  if (!status) return null;

  if (status.state === "suspended") {
    return "This organization is currently unavailable. Contact support if you need help.";
  }

  if (status.state === "locked") {
    return "Billing needs attention before this organization can be used again.";
  }

  if (status.state === "trial_pending") {
    return "Your organization opens once a Super Admin starts the trial on the web.";
  }

  if (status.state === "trial_grace") {
    return "The trial has ended, but the organization is still in its grace period. Try again to refresh access.";
  }

  if (status.state === "trial_ending_soon") {
    return "The trial is ending soon. Try again to refresh access.";
  }

  if (status.state === "payment_attention_required") {
    return "Billing needs attention, but the organization may still be available. Try again to refresh access.";
  }

  // The org looks fine now, so a billing fix may have just landed.
  return "This organization may be available again. Try again to refresh access.";
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

  const statusQuery = useQuery({
    queryKey: mobileQueryKeys.orgStatus(accessToken),
    queryFn: ({ signal }) => getOrgStatus(accessToken!, signal),
    enabled: Boolean(accessToken),
    retry: false,
  });
  const status = statusQuery.data ?? null;
  const isSuperAdmin = status?.orgRole === "super_admin";
  const body = isSuperAdmin
    ? formatLockedMessage(message)
    : "This organization is currently unavailable. Please try again later.";
  const detailLine = isSuperAdmin ? getDetailLine(status) : null;
  const graceDate =
    isSuperAdmin && status?.state === "trial_grace"
      ? formatGraceDate(status.trialGraceEndsAt)
      : null;

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
          <Text style={styles.eyebrow}>Account access</Text>
          <Text style={styles.title}>Organization unavailable</Text>
          <Text style={styles.body}>{body}</Text>
          {detailLine ? <Text style={styles.detail}>{detailLine}</Text> : null}
          {graceDate ? <Text style={styles.detail}>Grace period ends {graceDate}.</Text> : null}
        </View>

        <ActionButtons
          primaryAction={
            <Button label="Try again" loading={isRetrying} onPress={onRetry} tone="primary" />
          }
          style={styles.actions}
        >
          {isSuperAdmin ? (
            <Button
              label="Manage billing on web"
              onPress={() => {
                void openInAppBrowser(
                  `${getMobileEnvConfig().apiBaseUrl}/settings?section=org-billing`,
                  mobileColors,
                );
              }}
              tone="secondary"
            />
          ) : null}
          <Button label="Sign out" onPress={onSignOut} tone="neutral" />
        </ActionButtons>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
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
