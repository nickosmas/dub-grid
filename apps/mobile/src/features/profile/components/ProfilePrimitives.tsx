import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  mobileColors,
  mobileRadii,
  mobileText,
} from "../../../shared/theme/tokens";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function getProfileInitials(name: string, fallback = "DG") {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || fallback;
}

export function formatProfileValue(value: string | null | undefined) {
  return value && value.trim() ? value : "Not set";
}

export function formatProfileStatus(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function ProfileHero({
  initials,
  title,
  subtitle,
  badge,
  avatarStyle,
  avatarTextStyle,
  children,
}: {
  initials: string;
  title: string;
  subtitle: string;
  badge?: string;
  avatarStyle?: StyleProp<ViewStyle>;
  avatarTextStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={[styles.avatar, avatarStyle]}>
          <Text style={[styles.avatarText, avatarTextStyle]}>{initials}</Text>
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.heroTitleRow}>
            <Text numberOfLines={2} style={styles.heroTitle}>
              {title}
            </Text>
            {badge ? (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>{badge}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.heroSubtitle}>
            {subtitle}
          </Text>
        </View>
      </View>
      {children ? <View style={styles.heroDetail}>{children}</View> : null}
    </View>
  );
}

export function ProfileHeroMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.heroMetaItem}>
      <Text style={styles.heroMetaLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.heroMetaValue}>
        {value}
      </Text>
    </View>
  );
}

export function ProfileSection({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function ProfilePanel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function ProfileList({
  children,
  variant = "framed",
}: {
  children: ReactNode;
  variant?: "framed" | "plain";
}) {
  return (
    <View style={variant === "plain" ? styles.listPlain : styles.list}>
      {children}
    </View>
  );
}

export function ProfileInfoRow({
  iconName,
  label,
  value,
  detail,
  isLast = false,
}: {
  iconName?: IconName;
  label: string;
  value: string;
  detail?: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      {iconName ? <ProfileIcon name={iconName} /> : null}
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text numberOfLines={2} style={styles.rowValue}>
          {value}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={styles.rowDetail}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function ProfileNavRow({
  iconName,
  label,
  value,
  isLast = false,
  onPress,
}: {
  iconName: IconName;
  label: string;
  value?: string;
  isLast?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        styles.navRow,
        !isLast && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <ProfileIcon name={iconName} />
      <View style={styles.rowCopy}>
        <Text style={styles.navLabel}>{label}</Text>
        {value ? (
          <Text numberOfLines={1} style={styles.rowDetail}>
            {value}
          </Text>
        ) : null}
      </View>
      <Ionicons
        color={mobileColors.textSubtle}
        name="chevron-forward"
        size={22}
      />
    </Pressable>
  );
}

export function ProfileTextInput({
  label,
  error,
  focused = false,
  trailingAccessory,
  containerStyle,
  inputStyle,
  ...inputProps
}: TextInputProps & {
  label: string;
  error?: string | null;
  focused?: boolean;
  trailingAccessory?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  const { style: textInputStyle, ...resolvedInputProps } = inputProps;

  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {trailingAccessory ? (
        <View
          style={[
            styles.inputShell,
            focused && styles.inputFocused,
            error && styles.inputError,
          ]}
        >
          <TextInput
            {...resolvedInputProps}
            placeholderTextColor={mobileColors.textSubtle}
            style={[
              styles.input,
              styles.inputInShell,
              resolvedInputProps.multiline && styles.inputMultiline,
              textInputStyle,
              inputStyle,
            ]}
          />
          <View style={styles.inputAccessory}>{trailingAccessory}</View>
        </View>
      ) : (
        <TextInput
          {...resolvedInputProps}
          placeholderTextColor={mobileColors.textSubtle}
          style={[
            styles.input,
            resolvedInputProps.multiline && styles.inputMultiline,
            focused && styles.inputFocused,
            error && styles.inputError,
            textInputStyle,
            inputStyle,
          ]}
        />
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ProfileChoiceGroup({
  label,
  items,
  selectedIds,
  error,
  onToggle,
}: {
  label: string;
  items: Array<{ id: number; name: string; abbr?: string | null }>;
  selectedIds: number[];
  error?: string | null;
  onToggle: (id: number) => void;
}) {
  return (
    <View style={styles.chipGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {items.map((item) => {
          const selected = selectedIds.includes(item.id);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
              key={item.id}
              onPress={() => onToggle(item.id)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {item.abbr || item.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ProfileIcon({
  name,
  tone = "neutral",
}: {
  name: IconName;
  tone?: "neutral" | "brand" | "danger" | "success";
}) {
  return (
    <View
      style={[
        styles.iconBadge,
        tone === "brand" && styles.iconBadgeBrand,
        tone === "danger" && styles.iconBadgeDanger,
        tone === "success" && styles.iconBadgeSuccess,
      ]}
    >
      <Ionicons
        color={
          tone === "brand"
            ? mobileColors.brand
            : tone === "danger"
              ? mobileColors.dangerText
              : tone === "success"
                ? mobileColors.successText
                : mobileColors.textSecondary
        }
        name={name}
        size={18}
      />
    </View>
  );
}

export const profilePrimitiveStyles = StyleSheet.create({
  actionsStack: {
    gap: 10,
  },
  supportingText: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  subtleText: {
    ...mobileText.meta,
    color: mobileColors.textMuted,
  },
});

const styles = StyleSheet.create({
  hero: {
    backgroundColor: mobileColors.surface,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: mobileColors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  heroTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: mobileColors.brand,
    borderRadius: 32,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  avatarText: {
    ...mobileText.heroMetric,
    color: mobileColors.textInverse,
  },
  heroCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  heroTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
  },
  heroTitle: {
    ...mobileText.screenTitle,
    color: mobileColors.textPrimary,
    flexShrink: 1,
    minWidth: 0,
  },
  heroSubtitle: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: mobileColors.brandSoft,
    borderColor: mobileColors.brandBorder,
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    ...mobileText.caption,
    color: mobileColors.brand,
    fontWeight: "700",
  },
  heroDetail: {
    borderTopColor: mobileColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 14,
  },
  heroMetaItem: {
    flex: 1,
    gap: 3,
    minWidth: 120,
  },
  heroMetaLabel: {
    ...mobileText.caption,
    color: mobileColors.textSubtle,
  },
  heroMetaValue: {
    ...mobileText.rowTitle,
    color: mobileColors.textPrimary,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    ...mobileText.label,
    color: mobileColors.textSubtle,
    textTransform: "uppercase",
  },
  panel: {
    backgroundColor: mobileColors.surface,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  list: {
    backgroundColor: mobileColors.surface,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  listPlain: {
    gap: 0,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navRow: {
    minHeight: 70,
  },
  rowPressed: {
    opacity: 0.64,
  },
  rowDivider: {
    borderBottomColor: mobileColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowLabel: {
    ...mobileText.caption,
    color: mobileColors.textSubtle,
  },
  rowValue: {
    ...mobileText.rowTitle,
    color: mobileColors.textPrimary,
  },
  rowDetail: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  navLabel: {
    ...mobileText.cardTitle,
    color: mobileColors.textPrimary,
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    ...mobileText.caption,
    color: mobileColors.textSubtle,
    fontWeight: "600",
  },
  input: {
    ...mobileText.sectionTitle,
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.control,
    borderWidth: 1,
    color: mobileColors.textPrimary,
    fontWeight: "400",
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.control,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 48,
  },
  inputInShell: {
    backgroundColor: "transparent",
    borderWidth: 0,
    flex: 1,
    minHeight: 46,
    paddingRight: 8,
  },
  inputAccessory: {
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 6,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  inputFocused: {
    backgroundColor: mobileColors.surface,
    borderColor: mobileColors.brand,
  },
  inputError: {
    borderColor: mobileColors.dangerText,
  },
  errorText: {
    ...mobileText.caption,
    color: mobileColors.dangerText,
  },
  chipGroup: {
    gap: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: mobileColors.brandSoft,
    borderColor: mobileColors.brand,
  },
  chipPressed: {
    opacity: 0.64,
  },
  chipText: {
    ...mobileText.caption,
    color: mobileColors.textSecondary,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: mobileColors.brand,
  },
  iconBadge: {
    alignItems: "center",
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  iconBadgeBrand: {
    backgroundColor: mobileColors.brandSoft,
    borderColor: mobileColors.brandBorder,
  },
  iconBadgeDanger: {
    backgroundColor: mobileColors.dangerSoft,
    borderColor: mobileColors.dangerBorder,
  },
  iconBadgeSuccess: {
    backgroundColor: mobileColors.successSoft,
    borderColor: mobileColors.successBorder,
  },
});
