import { Platform } from "react-native";
import { featureFlags } from "react-native-screens";

/**
 * The native stack updates its screens' and header's layout from the main
 * thread synchronously by default, which measures text there. On iOS 27 that
 * deadlocked the app while the iPhone Duo folded or opened: the JavaScript
 * thread held React Native's text-measure lock while UIKit posted an
 * NSTextStorage notification that waits for the main thread, and the main
 * thread waited for the lock. Asynchronous updates keep the main thread out
 * of that lock. Set once, before any screen renders.
 */
export function configureNativeStackUpdates(): void {
  if (Platform.OS !== "ios") return;
  featureFlags.experiment.synchronousScreenUpdatesEnabled = false;
  featureFlags.experiment.synchronousHeaderConfigUpdatesEnabled = false;
  featureFlags.experiment.synchronousHeaderSubviewUpdatesEnabled = false;
}
