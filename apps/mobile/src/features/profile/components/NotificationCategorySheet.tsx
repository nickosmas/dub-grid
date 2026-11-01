import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import { AppSwitch } from "../../../shared/components/AppSwitch";
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileText,
  mobileTextWeighted,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import { ProfileIcon, ProfileList } from "./ProfilePrimitives";

export type NotificationChannel = "in_app" | "email";

export type NotificationCategoryDetail = {
  key: string;
  label: string;
  description: string;
  channels: Record<NotificationChannel, boolean>;
};

const CHANNELS: Array<{
  id: NotificationChannel;
  label: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>["name"];
}> = [
  {
    id: "in_app",
    label: "In-app",
    description: "Shows up in your in-app notification list.",
    icon: "phone-portrait-outline",
  },
  {
    id: "email",
    label: "Email",
    description: "Sent to the address on your account.",
    icon: "mail-outline",
  },
];

/**
 * The two delivery channels for one notification category.
 *
 * The category grid used to sit open on the page: three blocks, each with a
 * title, a description and two switches, on a single card — six switches with
 * no heading between them, where the row you were toggling was only findable
 * by counting. Worse, each "chip" was a `Pressable` with `accessibilityRole:
 * "switch"` wrapping a real `<Switch>`, so the control announced itself twice
 * and the chip and the switch inside it both fired the same toggle.
 */
export function NotificationCategorySheet({
  category,
  onDismiss,
  onToggle,
}: {
  /** `null` closes the sheet — the sheet owns no copy of the preferences. */
  category: NotificationCategoryDetail | null;
  onDismiss: () => void;
  onToggle: (categoryKey: string, channel: NotificationChannel) => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <BottomSheetModal
      header={
        <SheetHeader subtitle={category?.description} title={category?.label ?? "Notifications"} />
      }
      visible={category != null}
      onDismiss={onDismiss}
    >
      {category ? (
        <ProfileList>
          {CHANNELS.map((channel, index) => (
            <View
              key={channel.id}
              style={[
                styles.row,
                index < CHANNELS.length - 1 && !IS_NATIVE_LIST && styles.rowDivider,
              ]}
            >
              <ProfileIcon name={channel.icon} />
              <View style={styles.copy}>
                <Text style={styles.label}>{channel.label}</Text>
                <Text style={styles.description}>{channel.description}</Text>
              </View>
              <AppSwitch
                accessibilityLabel={`${channel.label} notifications`}
                value={category.channels[channel.id]}
                onValueChange={() => onToggle(category.key, channel.id)}
              />
              {index < CHANNELS.length - 1 && IS_NATIVE_LIST ? (
                <View style={styles.insetDivider} />
              ) : null}
            </View>
          ))}
        </ProfileList>
      ) : null}
    </BottomSheetModal>
  );
}

/**
 * The trailing value on a category row: which channels are on, or that none
 * are. Shared with the row so the summary and the sheet can't disagree.
 */
export function formatChannelSummary(channels: Record<NotificationChannel, boolean>): string {
  const enabled = CHANNELS.filter((channel) => channels[channel.id]).map(
    (channel) => channel.label,
  );

  return enabled.length > 0 ? enabled.join(", ") : "Off";
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // Inset to the text, past the icon column (16 + 28 + 12).
    insetDivider: {
      backgroundColor: mobileColors.borderSubtle,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      left: 56,
      position: "absolute",
      right: 0,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
    },
    rowDivider: {
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    copy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    label: {
      ...(IS_NATIVE_LIST ? mobileText.rowTitle : mobileTextWeighted("cardTitle", "medium")),
      color: mobileColors.textPrimary,
    },
    description: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
    },
  });
