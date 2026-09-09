import Ionicons from "@expo/vector-icons/Ionicons";
import { NETWORK_ERROR_MESSAGE, NETWORK_ERROR_TITLE } from "@dubgrid/client-errors";
import { useEffect, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../../shared/components/Button";
import { useNetworkRecovery } from "../../../shared/providers/NetworkRecoveryProvider";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileText, type MobileColors } from "../../../shared/theme/tokens";

/**
 * Recovery surface for a signed-in session whose required bootstrap data could
 * not load. It owns the connection message so ToastProvider does not overlay
 * the same offline banner on top of it.
 */
export function NetworkConnectionRecoveryScreen({
  isRetrying = false,
  onRetry,
}: {
  isRetrying?: boolean;
  onRetry: () => void | Promise<void>;
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
