import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MobileEnvValidation } from "../lib/env";
import { mobileColors, mobileRadii } from "../theme/tokens";

export function ConfigurationScreen({
  validation,
}: {
  validation: Extract<MobileEnvValidation, { status: "invalid" }>;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>DubGrid Mobile Setup</Text>
          <Text style={styles.title}>Mobile configuration needs attention</Text>
          <Text style={styles.body}>
            This Expo build does not have a phone-safe backend configuration yet.
            For a real phone, pick one of these:
          </Text>
          <Text style={styles.step}>1. Local backend: `npm run use:mobile:local`</Text>
          <Text style={styles.step}>2. Hosted backend: `npm run use:mobile:remote`</Text>
          <Text style={styles.step}>3. Restart Expo and re-open the app</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What needs fixing</Text>
          {validation.issues.map((issue) => (
            <View key={`${issue.key}-${issue.message}`} style={styles.issue}>
              <Text style={styles.issueKey}>{issue.key}</Text>
              <Text style={styles.issueMessage}>{issue.message}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileColors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
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
    color: mobileColors.brand,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: mobileColors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
  },
  body: {
    color: mobileColors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  step: {
    color: mobileColors.brand,
    fontSize: 15,
    fontWeight: "700",
  },
  sectionTitle: {
    color: mobileColors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
  },
  issue: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
  },
  issueKey: {
    color: mobileColors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  issueMessage: {
    color: mobileColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
