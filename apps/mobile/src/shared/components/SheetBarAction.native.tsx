import { useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { barActionIsCheckmark } from "../lib/bar-action";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace, mobileTextWeighted } from "../theme/tokens";
import { AppText } from "./AppText";
import { ICON_CONTROL_SIZE } from "./icon-control-style";
import { Pressable } from "./Pressable";
import type { BarActionProps } from "./sheet-bar-actions";

const IS_IOS = Platform.OS === "ios";
const HAS_LIQUID_GLASS = IS_IOS && isLiquidGlassAvailable();
const DISABLED_GLASS_TINT = "rgba(120, 120, 128, 0.36)";
const BAR_LABEL_MAX = 10;

/**
 * A bar action reads as a verb, as the system's Add, Save and Done do: a
 * label that repeats the title or runs long keeps its first word ("Add
 * person" under "Add person" is "Add"). Screen readers still get it whole.
 */
function barLabel(label: string | undefined, title: string | undefined): string | undefined {
  if (!label) return label;
  const repeatsTitle = title != null && label.toLowerCase() === title.toLowerCase();
  if (!repeatsTitle && label.length <= BAR_LABEL_MAX) return label;
  return label.split(" ")[0];
}

/**
 * A footer action moved into the bar. A commit that only saves is a
 * checkmark, as the close button is an X (owner, 2026-10-31): a tinted glass
 * circle on iOS and a Material icon button on Android, its words left to
 * screen readers. One with an outcome of its own (Send, Approve, Mark away)
 * or a destructive one keeps its words, as does a second action such as
 * Clear all: a glass capsule on iOS, a text button on Android. It spins while
 * the press's promise runs, as `Button` does.
 */
export function BarAction({ action, kind, title }: BarActionProps) {
  const label = barLabel(action.label, title);
  const mobileColors = useMobileColors();
  const [running, setRunning] = useState(false);
  const busy = Boolean(action.loading) || running;
  const disabled = Boolean(action.disabled) || busy;
  // Disabled, the capsule is gray glass with a white label, as the system
  // draws a prominent bar item it can't press (owner, 2026-10-31).
  const tint =
    kind === "secondary"
      ? undefined
      : disabled && !busy
        ? DISABLED_GLASS_TINT
        : action.tone === "danger"
          ? mobileColors.danger
          : mobileColors.brand;

  const asCheckmark =
    kind === "primary" && action.tone !== "danger" && barActionIsCheckmark(action.label);

  const press = () => {
    if (disabled) return;
    const result = action.onPress(undefined as never);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setRunning(true);
      void (result as Promise<unknown>).finally(() => setRunning(false));
    }
  };

  if (!IS_IOS) {
    return (
      <Pressable
        accessibilityLabel={action.accessibilityLabel ?? action.label}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy }}
        android_ripple={{ color: mobileColors.rippleNeutral, borderless: true }}
        disabled={disabled}
        hitSlop={8}
        onPress={press}
        style={asCheckmark ? styles.materialIconAction : styles.materialAction}
      >
        {busy ? (
          <ActivityIndicator color={mobileColors.brand} size="small" />
        ) : asCheckmark ? (
          <MaterialIcons
            color={disabled ? mobileColors.textSubtle : mobileColors.brand}
            name="check"
            size={24}
          />
        ) : (
          <AppText
            numberOfLines={1}
            style={[
              styles.materialActionLabel,
              {
                color: disabled
                  ? mobileColors.textSubtle
                  : action.tone === "danger"
                    ? mobileColors.dangerText
                    : kind === "secondary"
                      ? mobileColors.textSecondary
                      : mobileColors.brand,
              },
            ]}
          >
            {label}
          </AppText>
        )}
      </Pressable>
    );
  }

  const labelColor = tint ? mobileColors.onBrandText : mobileColors.textPrimary;
  const content = busy ? (
    <ActivityIndicator color={labelColor} size="small" />
  ) : asCheckmark ? (
    <Ionicons color={labelColor} name="checkmark" size={22} />
  ) : (
    <AppText numberOfLines={1} style={[styles.iosActionLabel, { color: labelColor }]}>
      {label}
    </AppText>
  );
  const shape = asCheckmark ? styles.iosIconAction : styles.iosAction;

  return (
    <Pressable
      accessibilityLabel={action.accessibilityLabel ?? action.label}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      hitSlop={8}
      onPress={press}
    >
      {HAS_LIQUID_GLASS ? (
        <GlassView glassEffectStyle="regular" isInteractive style={shape} tintColor={tint}>
          {content}
        </GlassView>
      ) : (
        <View style={[shape, { backgroundColor: tint ?? mobileColors.controlNeutralBg }]}>
          {content}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iosAction: {
    minWidth: ICON_CONTROL_SIZE + mobileSpace.lg,
    height: ICON_CONTROL_SIZE + mobileSpace.xs,
    borderRadius: (ICON_CONTROL_SIZE + mobileSpace.xs) / 2,
    paddingHorizontal: mobileSpace.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  // The same circle as the close button opposite it.
  iosIconAction: {
    width: ICON_CONTROL_SIZE,
    height: ICON_CONTROL_SIZE,
    borderRadius: ICON_CONTROL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  iosActionLabel: {
    ...mobileTextWeighted("body", "semibold"),
  },
  materialAction: {
    minHeight: ICON_CONTROL_SIZE,
    paddingHorizontal: mobileSpace.md,
    justifyContent: "center",
  },
  materialIconAction: {
    width: ICON_CONTROL_SIZE,
    height: ICON_CONTROL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  materialActionLabel: {
    ...mobileTextWeighted("bodyStrong", "semibold"),
  },
});
