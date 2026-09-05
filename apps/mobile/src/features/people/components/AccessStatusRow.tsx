import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../../../shared/components/AppText";
import { Button } from "../../../shared/components/Button";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, type MobileColors } from "../../../shared/theme/tokens";

/**
 * A compact "they currently have X access" row with an optional remove action,
 * the mobile counterpart of web's `AccessStatusRow`. Both apps use it to say the
 * same thing in the same words at the top of an editor: what this person's
 * access is right now, and what saving would do to it.
 */
export function AccessStatusRow({
  label,
  statusText,
  tone = "active",
  note,
  actionLabel,
  disabled,
  onAction,
}: {
  label: string;
  statusText: string;
  tone?: "active" | "neutral";
  /** A consequence of saving as things stand, printed in the danger colour. */
  note?: string;
  actionLabel?: string;
  disabled?: boolean;
  onAction?: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View
      accessibilityLabel={note ? `${label}: ${statusText}` : undefined}
      accessibilityRole={note ? "summary" : undefined}
      style={styles.row}
    >
      <View style={styles.copy}>
        <AppText tone="secondary" variant="label">
          {label}
        </AppText>
        <AppText
          tone={tone === "active" || note ? "primary" : "muted"}
          variant={note ? "bodyStrong" : "body"}
        >
          {statusText}
        </AppText>
        {note ? (
          <AppText tone="danger" variant="meta">
            {note}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Button compact disabled={disabled} label={actionLabel} onPress={onAction} tone="danger" />
      ) : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    row: {
      alignItems: "center",
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      flexDirection: "row",
      gap: mobileSpace.sm,
      justifyContent: "space-between",
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    copy: {
      flexShrink: 1,
      gap: 2,
    },
  });
