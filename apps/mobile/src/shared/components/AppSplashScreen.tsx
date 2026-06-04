import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mobileColors } from "../theme/tokens";
import { AnimatedDubGridLogo } from "./AnimatedDubGridLogo";

export function AppSplashScreen(_props?: { body?: string }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <AnimatedDubGridLogo />
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
    backgroundColor: mobileColors.background,
  },
});
