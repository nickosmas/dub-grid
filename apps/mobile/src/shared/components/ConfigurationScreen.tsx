import * as SplashScreen from "expo-splash-screen";
import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileEnvValidation } from "../lib/env";
import { mobileRadii, mobileText, type MobileColors, mobileSpace } from "../theme/tokens";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { getScreenBottomPadding } from "./screen-layout";

function getIssueTitle(key: string): string {
  switch (key) {
    case "EXPO_PUBLIC_API_BASE_URL":
      return "Mobile connection";
    case "EXPO_PUBLIC_SUPABASE_URL":
      return "Sign-in service";
    case "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY":
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
      return "This build is missing a reachable web connection.";
    case "EXPO_PUBLIC_SUPABASE_URL":
    case "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY":
      return "This build is missing sign-in configuration.";
    default:
      return "This build needs updated app configuration.";
  }
}

const SETUP_STEPS = [
  "1. Local backend: `npm run use:mobile:local`",
  "2. Hosted backend: `npm run use:mobile:remote`",
  "3. Restart Expo and re-open the app",
];

export function ConfigurationScreen({
  validation,
}: {
  validation: Extract<MobileEnvValidation, { status: "invalid" }>;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const insets = useSafeAreaInsets();

  // Rendered in place of StartupSplashGate, which owns the hide on every
  // other launch, so the native splash held by the root layout stays up over
  // this screen unless it comes down here.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

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
        <View style={styles.intro}>
          <Text style={styles.title}>Mobile configuration needs attention</Text>
          <Text style={styles.body}>
            This Expo build does not have a phone-safe backend configuration yet. For a real phone,
            pick one of these:
          </Text>
        </View>

        <View style={styles.card}>
          {SETUP_STEPS.map((step, index) => (
            <Text key={step} style={[styles.row, styles.step, index > 0 && styles.rowDivider]}>
              {step}
            </Text>
          ))}
        </View>

        <View style={styles.group}>
          <Text style={styles.groupTitle}>What needs fixing</Text>
          <View style={styles.card}>
            {validation.issues.map((issue, index) => (
              <View
                key={`${issue.key}-${issue.message}`}
                style={[styles.row, index > 0 && styles.rowDivider]}
              >
                <Text style={styles.issueKey}>{getIssueTitle(issue.key)}</Text>
                <Text style={styles.issueMessage}>{getIssueMessage(issue.key, issue.message)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 20,
      paddingBottom: 20,
      gap: 24,
    },
    intro: {
      gap: mobileSpace.sm,
    },
    group: {
      gap: mobileSpace.sm,
    },
    // A grouped list's card: flat in light mode, a hairline in dark.
    card: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      overflow: "hidden",
      ...(isDark
        ? { borderWidth: StyleSheet.hairlineWidth, borderColor: mobileColors.borderSubtle }
        : null),
    },
    row: {
      gap: 4,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
      marginLeft: mobileSpace.lg,
      paddingLeft: 0,
    },
    title: {
      ...mobileText.screenTitle,
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
    groupTitle: {
      ...mobileText.cardTitle,
      color: mobileColors.textPrimary,
      paddingHorizontal: mobileSpace.lg,
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
