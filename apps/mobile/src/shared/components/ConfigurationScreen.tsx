import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileEnvValidation } from "../lib/env";
import { mobileRadii, mobileText, type MobileColors } from "../theme/tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { getScreenBottomPadding } from "./screen-layout";

function getIssueTitle(key: string): string {
  switch (key) {
    case "EXPO_PUBLIC_API_BASE_URL":
      return "Mobile connection";
    case "EXPO_PUBLIC_SUPABASE_URL":
      return "Sign-in service";
    case "EXPO_PUBLIC_SUPABASE_ANON_KEY":
      return "Sign-in access";
    default:
      return "App setup";
  }
}

function getIssueMessage(key: string, message: string): string {
  if (/127\.0\.0\.1|localhost/i.test(message)) {
    return "This build points to an address this phone cannot reach.";
  }

  if (/hosted|local machine|local testing/i.test(message)) {
    return "This build mixes local and hosted services. Use a single reachable environment.";
  }

  switch (key) {
    case "EXPO_PUBLIC_API_BASE_URL":
      return "This build is missing a reachable DubGrid web connection.";
    case "EXPO_PUBLIC_SUPABASE_URL":
    case "EXPO_PUBLIC_SUPABASE_ANON_KEY":
      return "This build is missing sign-in configuration.";
    default:
      return "This build needs updated app configuration.";
  }
}

export function ConfigurationScreen({
  validation,
}: {
  validation: Extract<MobileEnvValidation, { status: "invalid" }>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const insets = useSafeAreaInsets();

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
        <View style={styles.card}>
          <Text style={styles.eyebrow}>DubGrid Mobile Setup</Text>
          <Text style={styles.title}>Mobile configuration needs attention</Text>
          <Text style={styles.body}>
            This Expo build does not have a phone-safe backend configuration yet. For a real phone,
            pick one of these:
          </Text>
          <Text style={styles.step}>1. Local backend: `npm run use:mobile:local`</Text>
          <Text style={styles.step}>2. Hosted backend: `npm run use:mobile:remote`</Text>
          <Text style={styles.step}>3. Restart Expo and re-open the app</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What needs fixing</Text>
          {validation.issues.map((issue) => (
            <View key={`${issue.key}-${issue.message}`} style={styles.issue}>
              <Text style={styles.issueKey}>{getIssueTitle(issue.key)}</Text>
              <Text style={styles.issueMessage}>{getIssueMessage(issue.key, issue.message)}</Text>
            </View>
          ))}
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
    padding: 20,
    paddingBottom: 20,
    gap: 16,
  },
  card: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
  },
  eyebrow: {
    ...mobileText.label,
    color: mobileColors.brand,
    textTransform: "uppercase",
  },
  title: {
    ...mobileText.heroMetric,
    fontSize: 28,
    lineHeight: 34,
    color: mobileColors.textPrimary,
  },
  body: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  step: {
    ...mobileText.bodyStrong,
    color: mobileColors.brand,
  },
  sectionTitle: {
    ...mobileText.sectionTitle,
    color: mobileColors.textPrimary,
  },
  issue: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
  },
  issueKey: {
    ...mobileText.bodyStrong,
    color: mobileColors.textPrimary,
  },
  issueMessage: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
});
