import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../../shared/components/Button";
import { getScreenBottomPadding } from "../../../shared/components/screen-layout";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpacing, mobileText, type MobileColors } from "../../../shared/theme/tokens";

function formatLockedMessage(message: string): string {
  return message.replace(/^Organization unavailable\.\s*/i, "").trim() || message;
}

export function OrganizationLockedScreen({
  message,
  isRetrying = false,
  onRetry,
  onSignOut,
}: {
  message: string;
  isRetrying?: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const insets = useSafeAreaInsets();
  const body = formatLockedMessage(message);

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
        </View>

        <View style={styles.actions}>
          <Button label="Try again" loading={isRetrying} onPress={onRetry} tone="primary" />
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
  actions: {
    gap: mobileSpacing.cardGap,
  },
});
