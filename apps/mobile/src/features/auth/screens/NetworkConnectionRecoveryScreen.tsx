import { NETWORK_ERROR_MESSAGE, NETWORK_ERROR_TITLE } from "@dubgrid/client-errors";
import { useEffect, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, View } from "react-native";
import { ContentUnavailable } from "../../../shared/components/ContentUnavailable";
import { useNetworkRecovery } from "../../../shared/providers/NetworkRecoveryProvider";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { type MobileColors } from "../../../shared/theme/tokens";

/**
 * Recovery surface for a signed-in session whose required bootstrap data could
 * not load. It owns the connection message so ToastProvider does not overlay
 * the same offline banner on top of it.
 */
export function NetworkConnectionRecoveryScreen({
  isRetrying = false,
  onRetry,
  onSignInAgain,
}: {
  isRetrying?: boolean;
  onRetry: () => void | Promise<void>;
  /** A way out when retrying can never work, such as unreadable stored sign-in data. */
  onSignInAgain?: () => void | Promise<void>;
}) {
  const colors = useMobileColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setNetworkRecoveryActive } = useNetworkRecovery();

  useEffect(() => {
    setNetworkRecoveryActive(true);
    return () => setNetworkRecoveryActive(false);
  }, [setNetworkRecoveryActive]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ContentUnavailable
          body={NETWORK_ERROR_MESSAGE}
          iconName="cloud-offline-outline"
          primaryAction={{ label: "Try again", loading: isRetrying, onPress: onRetry }}
          secondaryAction={
            onSignInAgain
              ? { label: "Sign in again", disabled: isRetrying, onPress: onSignInAgain }
              : undefined
          }
          title={NETWORK_ERROR_TITLE}
        />
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: MobileColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    content: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 32,
    },
  });
