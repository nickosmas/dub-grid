import Ionicons from "@expo/vector-icons/Ionicons";
import { NETWORK_ERROR_MESSAGE, NETWORK_ERROR_TITLE } from "@dubgrid/client-errors";
import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { useNetworkRecovery } from "../../../shared/providers/NetworkRecoveryProvider";
import { useOptionalNetworkStatus } from "../../../shared/providers/NetworkStateProvider";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileText, type MobileColors } from "../../../shared/theme/tokens";

/**
 * Recovery surface for a signed-in session whose required bootstrap data could
 * not load. It owns the connection message so ToastProvider does not overlay
 * the same offline banner on top of it.
 */
export function NetworkConnectionRecoveryScreen({
  isRetrying = false,
  automaticallyRetry = true,
  onRetry,
}: {
  isRetrying?: boolean;
  automaticallyRetry?: boolean;
  onRetry: () => void | Promise<void>;
}) {
  const colors = useMobileColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setNetworkRecoveryActive } = useNetworkRecovery();
  const { isOffline } = useOptionalNetworkStatus();
  const [automaticRetryCount, setAutomaticRetryCount] = useState(0);
  const automaticRetryInFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    setNetworkRecoveryActive(true);
    return () => setNetworkRecoveryActive(false);
  }, [setNetworkRecoveryActive]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!automaticallyRetry || isOffline || isRetrying) return;
    const cappedDelay = Math.min(5_000 * 2 ** automaticRetryCount, 30_000);
    const delay = Math.round(cappedDelay * (0.5 + Math.random() * 0.5));
    const timer = setTimeout(() => {
      if (automaticRetryInFlight.current) return;
      automaticRetryInFlight.current = true;
      Promise.resolve()
        .then(onRetry)
        .catch(() => undefined)
        .finally(() => {
          automaticRetryInFlight.current = false;
          if (mounted.current) {
            setAutomaticRetryCount((count) => count + 1);
          }
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [automaticallyRetry, automaticRetryCount, isOffline, isRetrying, onRetry]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.iconFrame}>
          <Ionicons color={colors.brand} name="cloud-offline-outline" size={28} />
        </View>
        <Text style={styles.title}>{NETWORK_ERROR_TITLE}</Text>
        <Text style={styles.body}>{NETWORK_ERROR_MESSAGE}</Text>
        <View style={styles.actions}>
          <Button label="Try again" loading={isRetrying} onPress={onRetry} />
        </View>
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
    iconFrame: {
      alignItems: "center",
      backgroundColor: colors.brandSoft,
      borderRadius: mobileRadii.pill,
      height: 56,
      justifyContent: "center",
      marginBottom: 16,
      width: 56,
    },
    title: { ...mobileText.sectionTitle, color: colors.textPrimary, textAlign: "center" },
    body: {
      ...mobileText.body,
      color: colors.textSubtle,
      marginTop: 12,
      textAlign: "center",
    },
    actions: { gap: 12, marginTop: 28, width: "100%" },
  });
