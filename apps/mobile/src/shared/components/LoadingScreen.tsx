import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mobileColors } from "../theme/tokens";

export function LoadingScreen({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color={mobileColors.brand} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
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
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: mobileColors.textPrimary,
  },
  body: {
    textAlign: "center",
    color: mobileColors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
});
