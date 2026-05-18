import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { mobileColors } from "../theme/tokens";

export function AppSplashScreen(_props?: { body?: string }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Animated.View entering={FadeIn.duration(360).springify().damping(18)}>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="DubGrid logo"
            source={require("../../../assets/images/logo-blue.png")}
            style={styles.logo}
          />
        </Animated.View>
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
  logo: {
    width: 120,
    height: 120,
  },
});
