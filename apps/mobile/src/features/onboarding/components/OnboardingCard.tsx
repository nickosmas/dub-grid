import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";

export function OnboardingCard({
  visual,
  title,
  body,
  width,
}: {
  visual: ReactNode;
  title: string;
  body: string;
  width: number;
}) {
  return (
    <View style={[styles.page, { width }]}>
      <View style={styles.content}>
        <View style={styles.visualFrame}>{visual}</View>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  content: {
    alignItems: "center",
    gap: 16,
    maxWidth: 360,
    width: "100%",
  },
  visualFrame: {
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    ...mobileText.heroMetric,
    color: mobileColors.textPrimary,
    fontSize: 26,
    lineHeight: 32,
    textAlign: "center",
  },
  body: {
    ...mobileText.body,
    color: mobileColors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
