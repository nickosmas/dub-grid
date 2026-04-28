import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mobileColors } from "../theme/tokens";

export function AppSplashScreen({
  body = "Preparing your schedule, requests, and mobile tools.",
}: {
  body?: string;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.brandLockup}>
          <Text style={styles.kicker}>DubGrid Mobile</Text>
          <Text style={styles.title}>Staff scheduling, ready for the floor.</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="large" color={mobileColors.brand} />
          <Text style={styles.loadingLabel}>Opening workspace</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileColors.background,
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 32,
    backgroundColor: mobileColors.background,
  },
  brandLockup: {
    marginTop: 48,
    gap: 14,
  },
  kicker: {
    color: mobileColors.brand,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    color: mobileColors.textPrimary,
    fontSize: 38,
    fontWeight: "800",
    lineHeight: 44,
    maxWidth: 320,
  },
  body: {
    color: mobileColors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 300,
  },
  loadingRow: {
    alignItems: "center",
    gap: 14,
    paddingBottom: 24,
  },
  loadingLabel: {
    color: mobileColors.brand,
    fontSize: 15,
    fontWeight: "700",
  },
});
