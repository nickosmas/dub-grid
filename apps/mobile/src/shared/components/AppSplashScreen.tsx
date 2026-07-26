import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type MobileColors } from "../theme/tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { AnimatedDubGridLogo } from "./AnimatedDubGridLogo";

export function AppSplashScreen(_props?: { body?: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <AnimatedDubGridLogo />
      </View>
    </SafeAreaView>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.background,
    },
  });
