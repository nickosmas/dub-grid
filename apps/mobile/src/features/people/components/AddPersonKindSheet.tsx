import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import { ProfileIcon } from "../../profile/components/ProfilePrimitives";

export type AddPersonKind = "scheduled" | "management";

/**
 * What kind of person is being added, asked the way web's Add menu asks it.
 * The button used to follow whichever roster tab was in front, which made
 * inviting a manager from the Schedule tab a two-step guess.
 */
export function AddPersonKindSheet({
  visible,
  onDismiss,
  onSelect,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (kind: AddPersonKind) => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <BottomSheetModal
      header={<SheetHeader title="Add person" />}
      visible={visible}
      onDismiss={onDismiss}
    >
      <View style={styles.options}>
        <KindOption
          description="Appears on the schedule, with a staff profile."
          divider
          iconName="calendar-outline"
          label="Scheduled staff"
          onPress={() => onSelect("scheduled")}
        />
        <KindOption
          description="Needs app access but won't appear on the schedule."
          iconName="key-outline"
          label="Management staff"
          onPress={() => onSelect("management")}
        />
      </View>
    </BottomSheetModal>
  );
}

function KindOption({
  description,
  divider = false,
  iconName,
  label,
  onPress,
}: {
  description: string;
  divider?: boolean;
  iconName: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <PressableRow
      accessibilityLabel={label}
      style={[styles.option, divider && styles.optionDivider]}
      onPress={onPress}
    >
      <ProfileIcon name={iconName} />
      <View style={styles.optionCopy}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={22} />
    </PressableRow>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // A hairline rather than `cardBorder`: a card inside a sheet is flat, so
    // without it there was no edge at all in light mode (see SignOutScopeSheet).
    options: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      overflow: "hidden",
    },
    option: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
    },
    optionDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    optionCopy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    optionLabel: {
      ...mobileTextWeighted("cardTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    optionDescription: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
  });
