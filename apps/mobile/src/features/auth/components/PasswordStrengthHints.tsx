import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, mobileTextWeighted } from "../../../shared/theme/tokens";
import {
  PASSWORD_STRENGTH_LABELS,
  getPasswordStrengthHints,
  getPasswordStrengthLevel,
} from "@dubgrid/domain";

/**
 * The password rules as plain text under the field, the way iOS lists a
 * password's requirements: no box of their own, each rule led by a check that
 * fills in once it is met.
 */
export function PasswordStrengthHints({ password }: { password: string }) {
  const mobileColors = useMobileColors();
  const hints = getPasswordStrengthHints(password);
  const level = getPasswordStrengthLevel(password);
  const hasStartedTyping = password.length > 0;

  const levelTone = level === 3 ? "success" : level === 0 ? "danger" : "warning";

  return (
    <View accessibilityLabel="Password strength hints" style={styles.root}>
      <View style={styles.header}>
        <AppText style={styles.headerText} tone="muted" variant="meta">
          Password strength
        </AppText>
        {hasStartedTyping ? (
          <AppText style={styles.headerText} tone={levelTone} variant="meta">
            {PASSWORD_STRENGTH_LABELS[level]}
          </AppText>
        ) : null}
      </View>
      <View style={styles.hintList}>
        {hints.map((hint) => (
          <View key={hint.id} style={styles.hintRow}>
            <Ionicons
              color={hint.met ? mobileColors.success : mobileColors.textSubtle}
              name={hint.met ? "checkmark-circle" : "ellipse-outline"}
              size={16}
            />
            <AppText
              style={styles.hintText}
              tone={hint.met ? "secondary" : "subtle"}
              variant="meta"
            >
              {hint.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: mobileSpace.sm,
    paddingHorizontal: mobileSpace.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: mobileSpace.sm,
  },
  headerText: mobileTextWeighted("meta", "semibold"),
  hintList: {
    gap: mobileSpace.xs,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.sm,
  },
  // A long hint wraps beside its check instead of sizing to the full row.
  hintText: {
    flexShrink: 1,
  },
});
