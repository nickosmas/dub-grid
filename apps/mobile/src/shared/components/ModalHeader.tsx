import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { mobileSpace } from "../theme/tokens";

export function ModalHeader({
  title,
  subtitle,
  closeLabel = "Close",
  closeDisabled = false,
  onClose,
}: {
  title: string;
  subtitle?: string;
  closeLabel?: string;
  closeDisabled?: boolean;
  onClose: () => void;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <AppText variant="heroMetric">{title}</AppText>
        {subtitle ? (
          <AppText tone="muted" variant="body">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Button
        accessibilityLabel={closeLabel}
        disabled={closeDisabled}
        icon="close"
        iconOnly
        onPress={onClose}
        tone="neutral"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: mobileSpace.md,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: mobileSpace.xs,
    // Optically centres the title against the 44pt close button.
    paddingTop: mobileSpace.sm,
  },
});
