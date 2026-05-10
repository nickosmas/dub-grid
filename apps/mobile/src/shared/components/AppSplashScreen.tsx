import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mobileColors, mobileText } from "../theme/tokens";

export function AppSplashScreen({
  body = "Preparing your schedule, requests, and mobile tools.",
}: {
  body?: string;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.brandLockup}>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="DubGrid logo"
            source={require("../../../assets/images/logo-blue.png")}
            style={styles.logo}
          />
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
  logo: {
    width: 88,
    height: 88,
    marginBottom: 6,
  },
  kicker: {
    ...mobileText.label,
    color: mobileColors.brand,
    textTransform: "uppercase",
  },
  title: {
    color: mobileColors.textPrimary,
    fontSize: 38,
    fontWeight: "700",
    lineHeight: 44,
    maxWidth: 320,
  },
  body: {
    ...mobileText.sectionTitle,
    color: mobileColors.textMuted,
    fontWeight: "400",
    maxWidth: 300,
  },
  loadingRow: {
    alignItems: "center",
    gap: 14,
    paddingBottom: 24,
  },
  loadingLabel: {
    ...mobileText.bodyStrong,
    color: mobileColors.brand,
  },
});
