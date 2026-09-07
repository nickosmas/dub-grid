import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { ProfileIcon } from "./ProfilePrimitives";

export type SignOutScope = "others" | "global";

/**
 * The two bulk sign-out choices, with room to say what each one does.
 *
 * These used to be two danger buttons side by side *above* the session list —
 * the page led with its most destructive actions, in a two-column row too
 * narrow for either to explain itself, where "Sign out other sessions" and
 * "Sign out all devices" are one word apart and differ in whether the user
 * stays signed in. A sheet holds a sentence per option, which is the whole
 * difference between them.
 */
export function SignOutScopeSheet({
  hasOtherSessions,
  visible,
  onDismiss,
  onSelect,
}: {
  hasOtherSessions: boolean;
  visible: boolean;
  onDismiss: () => void;
  onSelect: (scope: SignOutScope) => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <BottomSheetModal
      header={<SheetHeader title="Sign out devices" />}
      visible={visible}
      onDismiss={onDismiss}
    >
      <View style={styles.options}>
        <ScopeOption
          description={
            hasOtherSessions
              ? "Every other device is signed out. You stay signed in here."
              : "No other active devices are signed in."
          }
          disabled={!hasOtherSessions}
          divider
          iconName="phone-portrait-outline"
          label="Sign out other devices"
          onPress={() => onSelect("others")}
        />
        <ScopeOption
          description="Every device is signed out, including this one. You'll need to sign in again."
          iconName="log-out-outline"
          label="Sign out everywhere"
          tone="danger"
          onPress={() => onSelect("global")}
        />
      </View>
    </BottomSheetModal>
  );
}

function ScopeOption({
  description,
  disabled = false,
  divider = false,
  iconName,
  label,
  tone,
  onPress,
}: {
  description: string;
  disabled?: boolean;
  divider?: boolean;
  iconName: ComponentProps<typeof Ionicons>["name"];
  label: string;
  tone?: "danger";
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <PressableRow
      accessibilityLabel={label}
      disabled={disabled}
      style={[styles.option, divider && styles.optionDivider]}
      onPress={onPress}
    >
      <ProfileIcon name={iconName} tone={tone} />
      <View style={styles.optionCopy}>
        <Text style={[styles.optionLabel, tone === "danger" && styles.optionLabelDanger]}>
          {label}
        </Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
    </PressableRow>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    options: {
      backgroundColor: mobileColors.surface,
      // A hairline, not `cardBorder`. Cards on the page are drawn by their
      // shadow, which is why `cardBorder` is transparent in light mode - but a
      // card inside a sheet is deliberately flat (see `flatInSheet`), so with
      // no shadow to draw it there was no edge at all in light mode. Dark is
      // unchanged: `cardBorder` already resolves to this token there.
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      overflow: "hidden",
    },
    option: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    optionDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    optionCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    optionLabel: {
      ...mobileTextWeighted("cardTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    optionLabelDanger: {
      color: mobileColors.dangerText,
    },
    optionDescription: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
  });
