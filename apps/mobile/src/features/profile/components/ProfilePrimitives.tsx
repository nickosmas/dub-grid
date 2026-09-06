import { ActionButtons } from "../../../shared/components/ActionButtons";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Children,
  createContext,
  useContext,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
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
import { AccessInsignia } from "../../../shared/components/AccessInsignia";
import { Chip } from "../../../shared/components/Chip";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useIsInsideSheet } from "../../../shared/components/BottomSheetModal";
import { useKeyboardDoneAccessory } from "../../../shared/components/KeyboardDoneAccessory";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileElevation,
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
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

/**
 * How the hero arranges its identity block.
 *
 * `row` is the compact heading a settings-style page wants: avatar left, name
 * and subtitle beside it. `center` stacks them under a larger avatar, which is
 * the shape a page whose whole subject *is* a person wants — the profile and
 * both person detail screens. Held in context rather than passed down so
 * `ProfileHeroMeta` can follow the alignment without every caller repeating it.
 */
export type ProfileHeroAlign = "row" | "center";

const ProfileHeroAlignContext = createContext<ProfileHeroAlign>("row");

export function ProfileHero({
  align = "row",
  initials,
  title,
  subtitle,
  badge,
  badgeTone = "brand",
  onBadgePress,
  badgeAccessibilityLabel,
  orgRole,
  avatarStyle,
  avatarTextStyle,
  style,
  children,
}: {
  align?: ProfileHeroAlign;
  /** Omit along with the rest of the identity block to leave only the meta grid. */
  initials?: string;
  /**
   * Omit where the route's native header already carries it. A `row` hero on a
   * large-title route does, since iOS renders that title as the page's own
   * heading; a `center` hero is the heading, so its route takes a plain, static
   * title instead and the name is printed here once.
   */
  title?: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: "brand" | "contrast" | "warning";
  /**
   * Turns the badge into a control. Given one, the pill grows a chevron and
   * takes presses; without one it stays the static label every other hero
   * shows, so no existing caller changes shape.
   */
  onBadgePress?: () => void;
  badgeAccessibilityLabel?: string;
  /**
   * Paints the access insignia on the avatar's corner, ringed in the page
   * background so it reads as cut out of the avatar rather than sitting on it.
   * Plain users and members with no account get none.
   */
  orgRole?: string | null;
  avatarStyle?: StyleProp<ViewStyle>;
  avatarTextStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const isCentered = align === "center";

  // A screen whose native header already names it may want none of the
  // identity block at all, leaving the meta grid as the whole hero. Rendering
  // the row anyway would leave its gap above the grid.
  const hasIdentity = Boolean(initials || title || badge || subtitle);

  const badgeTextStyle = [
    styles.heroBadgeText,
    badgeTone === "contrast" && styles.heroBadgeTextContrast,
    badgeTone === "warning" && styles.heroBadgeTextWarning,
  ];
  const badgeStyle = [
    styles.heroBadge,
    // `heroBadge` pins itself with `alignSelf: "flex-start"`, which beats a
    // centered parent's `alignItems` and would hang the pill off the left
    // edge of an otherwise centered block.
    isCentered && styles.heroBadgeCentered,
    badgeTone === "contrast" && styles.heroBadgeContrast,
    badgeTone === "warning" && styles.heroBadgeWarning,
  ];
  const badgeChevronColor =
    badgeTone === "contrast"
      ? mobileColors.textInverse
      : badgeTone === "warning"
        ? mobileColors.warningText
        : mobileColors.brand;

  const badgeNode = badge ? (
    onBadgePress ? (
      <Pressable
        accessibilityHint="Opens the access level picker"
        accessibilityLabel={badgeAccessibilityLabel ?? badge}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBadgePress}
        style={({ pressed }) => [...badgeStyle, pressed && styles.heroBadgePressed]}
      >
        <Text style={badgeTextStyle}>{badge}</Text>
        <Ionicons color={badgeChevronColor} name="chevron-down" size={13} />
      </Pressable>
    ) : (
      <View style={badgeStyle}>
        <Text style={badgeTextStyle}>{badge}</Text>
      </View>
    )
  ) : null;

  return (
    <ProfileHeroAlignContext.Provider value={align}>
      <View style={[styles.hero, style]}>
        {hasIdentity ? (
          <View style={[styles.heroTop, isCentered && styles.heroTopCentered]}>
            {initials ? (
              <View style={[styles.avatar, isCentered && styles.avatarLarge, avatarStyle]}>
                <Text
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[styles.avatarText, isCentered && styles.avatarTextLarge, avatarTextStyle]}
                >
                  {initials}
                </Text>
              </View>
            ) : null}
            <View style={[styles.heroCopy, isCentered && styles.heroCopyCentered]}>
              {title || badgeNode ? (
                <View style={[styles.heroTitleRow, isCentered && styles.heroTitleRowCentered]}>
                  {title ? (
                    <Text
                      numberOfLines={2}
                      style={[styles.heroTitle, isCentered && styles.heroTitleCentered]}
                    >
                      {title}
                    </Text>
                  ) : null}
                  <AccessInsignia orgRole={orgRole} size={isCentered ? "lg" : "sm"} />
                  {/* Centered, the badge goes under the name instead of beside
                      it: a pill tucked against a 26pt title pulls the whole
                      block off center, and the eye reads the pair as one
                      lopsided line rather than a name with a label. */}
                  {isCentered ? null : badgeNode}
                </View>
              ) : null}
              {subtitle ? (
                <Text
                  numberOfLines={1}
                  style={[styles.heroSubtitle, isCentered && styles.heroSubtitleCentered]}
                >
                  {subtitle}
                </Text>
              ) : null}
              {isCentered ? badgeNode : null}
            </View>
          </View>
        ) : null}
        {children ? (
          <View style={[styles.heroDetail, isCentered && styles.heroDetailCentered]}>
            {children}
          </View>
        ) : null}
      </View>
    </ProfileHeroAlignContext.Provider>
  );
}

export function ProfileHeroMeta({ label, value }: { label: string; value: string }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const isCentered = useContext(ProfileHeroAlignContext) === "center";

  return (
    <View style={[styles.heroMetaItem, isCentered && styles.heroMetaItemCentered]}>
      <Text style={[styles.heroMetaLabel, isCentered && styles.heroMetaTextCentered]}>{label}</Text>
      <Text style={[styles.heroMetaValue, isCentered && styles.heroMetaTextCentered]}>{value}</Text>
    </View>
  );
}

export function ProfileSection({
  title,
  description,
  children,
  style,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
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
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const insideSheet = useIsInsideSheet();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={[styles.panel, insideSheet ? styles.flatInSheet : null, style]}>{children}</View>
  );
}

export function ProfileList({
  children,
  variant = "framed",
}: {
  children: ReactNode;
  variant?: "framed" | "plain";
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const insideSheet = useIsInsideSheet();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View
      style={[
        variant === "plain" ? styles.listPlain : styles.list,
        insideSheet ? styles.flatInSheet : null,
      ]}
    >
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
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

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
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <PressableRow
      onPress={onPress}
      style={[styles.row, styles.navRow, !isLast && styles.rowDivider]}
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
      <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={22} />
    </PressableRow>
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
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { style: textInputStyle, ...resolvedInputProps } = inputProps;
  const { inputAccessoryViewID, keyboardDoneAccessory } = useKeyboardDoneAccessory(inputProps);

  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {trailingAccessory ? (
        <View
          style={[styles.inputShell, focused && styles.inputFocused, error && styles.inputError]}
        >
          <TextInput
            // The visible <Text> label isn't associated with the input on
            // native, so without this the field is announced unlabeled.
            accessibilityLabel={resolvedInputProps.accessibilityLabel ?? label}
            {...resolvedInputProps}
            inputAccessoryViewID={inputAccessoryViewID}
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
          accessibilityLabel={resolvedInputProps.accessibilityLabel ?? label}
          {...resolvedInputProps}
          inputAccessoryViewID={inputAccessoryViewID}
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
      {keyboardDoneAccessory}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ProfileChoiceGroup<TId extends string | number>({
  label,
  items,
  selectedIds,
  error,
  onToggle,
}: {
  label: string;
  items: Array<{
    id: TId;
    name: string;
    abbr?: string | null;
    disabled?: boolean;
    disabledReason?: string;
  }>;
  selectedIds: TId[];
  error?: string | null;
  onToggle: (id: TId) => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.chipGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {items.map((item) => (
          <Chip
            accessibilityLabel={
              item.disabledReason ? `${item.name}. ${item.disabledReason}` : item.name
            }
            disabled={item.disabled}
            key={item.id}
            label={item.name}
            onPress={() => onToggle(item.id)}
            selected={selectedIds.includes(item.id)}
          />
        ))}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ProfileIcon({
  name,
  tone,
}: {
  name: IconName;
  /**
   * Semantic override, for the rare row whose meaning is the colour. Left off,
   * the icon is monochrome like every other row.
   */
  tone?: "neutral" | "brand" | "danger" | "success";
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  const semanticColor =
    tone === "brand"
      ? mobileColors.brand
      : tone === "danger"
        ? mobileColors.dangerText
        : tone === "success"
          ? mobileColors.successText
          : null;

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
        // Monochrome: a settings list is a list of labels, and a hue per row
        // competes with them for attention while meaning nothing. `textPrimary`
        // rather than a literal black, so the glyph inverts with the theme.
        color={semanticColor ?? mobileColors.textPrimary}
        // The outline glyph, as passed. An outline at full-strength ink weighs
        // the same as a gray solid but keeps its detail, which is what tells
        // one row's icon from the next.
        name={name}
        size={18}
      />
    </View>
  );
}

/**
 * The layout shapes a person page is built from, shared by the staff profile
 * and the management profile so the two read as the same page.
 *
 * Layout only, with no colour in it, so one module-scope sheet serves every
 * render rather than a themed `createStyles` pass per screen.
 */
const personLayoutStyles = StyleSheet.create({
  heroFacts: {
    gap: 8,
    // Full width, so every line centers on the page's axis rather than on
    // whichever of them happens to be widest. `heroDetail` is a row, where
    // `alignSelf: "stretch"` would stretch this vertically instead.
    width: "100%",
  },
  heroFactsRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    paddingBottom: 16,
  },
  actionStack: {
    gap: 10,
    paddingTop: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionRowItem: {
    flex: 1,
  },
});

/** The stack of fact lines under a centered hero's name. */
export function ProfileHeroFacts({ children }: { children: ReactNode }) {
  return <View style={personLayoutStyles.heroFacts}>{children}</View>;
}

/**
 * One fact line. Its own row because a `Chip` pins itself with
 * `alignSelf: "flex-start"`: left to a column it would sit against the left
 * edge under a centered name, and only `justifyContent` on a row centers it.
 */
export function ProfileHeroFactsRow({ children }: { children: ReactNode }) {
  return <View style={personLayoutStyles.heroFactsRow}>{children}</View>;
}

/**
 * The row of plain pills directly under the hero. The colour lives in each
 * button's icon, so the set reads as one group of actions on the person rather
 * than as competing fills.
 */
export function ProfileQuickActions({ children }: { children: ReactNode }) {
  return <View style={personLayoutStyles.quickActions}>{children}</View>;
}

/** Management actions at the foot of a person page. */
export function ProfileActionStack({ children }: { children: ReactNode }) {
  return <ActionButtons style={personLayoutStyles.actionStack}>{children}</ActionButtons>;
}

/** Compatibility wrapper for existing two-action profile rows. */
export function ProfileActionRow({ children }: { children: ReactNode }) {
  return (
    <View style={personLayoutStyles.actionRow}>
      {Children.map(children, (child) =>
        child == null ? null : <View style={personLayoutStyles.actionRowItem}>{child}</View>,
      )}
    </View>
  );
}

const createProfilePrimitiveStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
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

export function useProfilePrimitiveStyles() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  return useMemo(() => createProfilePrimitiveStyles(mobileColors), [mobileColors, isDark]);
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    hero: {
      gap: 14,
      paddingTop: 4,
    },
    heroTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 14,
    },
    heroTopCentered: {
      flexDirection: "column",
      gap: 14,
      paddingTop: 8,
    },
    avatar: {
      alignItems: "center",
      backgroundColor: mobileColors.brand,
      borderRadius: 32,
      height: 64,
      justifyContent: "center",
      width: 64,
    },
    avatarLarge: {
      borderRadius: 48,
      height: 96,
      width: 96,
    },
    avatarText: {
      ...mobileText.heroMetric,
      color: mobileColors.textInverse,
    },
    // Size only: the weight rides on `heroMetric`'s family, and naming a
    // fontWeight next to it would send Android hunting for a bold face this
    // single-weight family hasn't got.
    avatarTextLarge: {
      fontSize: 32,
      lineHeight: 40,
    },
    heroCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    // Stretched rather than flexed: in a column `flex: 1` would stretch the
    // copy down the cross axis instead of sizing it to its text.
    heroCopyCentered: {
      alignItems: "center",
      alignSelf: "stretch",
      flexBasis: "auto",
      flexGrow: 0,
      gap: 6,
    },
    heroTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      minWidth: 0,
    },
    heroTitleRowCentered: {
      justifyContent: "center",
    },
    heroTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
      flexShrink: 1,
      minWidth: 0,
    },
    heroTitleCentered: {
      fontSize: 26,
      lineHeight: 32,
      textAlign: "center",
    },
    heroSubtitle: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    heroSubtitleCentered: {
      textAlign: "center",
    },
    heroBadge: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroBadgeCentered: {
      alignSelf: "center",
    },
    heroBadgePressed: {
      opacity: 0.6,
    },
    heroBadgeText: {
      ...mobileTextWeighted("caption", "semibold"),
      color: mobileColors.brand,
    },
    heroBadgeContrast: {
      backgroundColor: mobileColors.textPrimary,
      borderColor: mobileColors.textPrimary,
    },
    heroBadgeTextContrast: {
      color: mobileColors.textInverse,
    },
    heroBadgeWarning: {
      backgroundColor: mobileColors.warningSoft,
      borderColor: mobileColors.warningBorder,
    },
    heroBadgeTextWarning: {
      color: mobileColors.warningText,
    },
    heroDetail: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    heroDetailCentered: {
      alignItems: "center",
      justifyContent: "center",
    },
    heroMetaItem: {
      flex: 1,
      gap: 3,
      minWidth: 120,
    },
    heroMetaItemCentered: {
      alignItems: "center",
      // The 120pt floor above wraps three cells to 2 + 1 at phone widths, and a
      // stranded last cell is the one arrangement a centered hero cannot
      // balance. Flexed evenly they stay one symmetric strip.
      minWidth: 0,
    },
    heroMetaTextCentered: {
      textAlign: "center",
    },
    heroMetaLabel: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    heroMetaValue: {
      ...mobileTextWeighted("rowTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    section: {
      gap: 10,
    },
    sectionTitle: {
      ...mobileTextWeighted("label", "medium"),
      color: mobileColors.textSubtle,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    sectionDescription: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      marginTop: -4,
    },
    // Cancels the card shadow when this is rendered inside a sheet.
    flatInSheet: {
      boxShadow: undefined,
      shadowOpacity: 0,
      elevation: 0,
    },
    panel: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: 14,
      padding: 16,
      ...mobileElevation("card", isDark),
    },
    list: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      overflow: "hidden",
      ...mobileElevation("card", isDark),
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
      ...mobileTextWeighted("rowTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    rowDetail: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    navLabel: {
      ...mobileTextWeighted("cardTitle", "medium"),
      color: mobileColors.textPrimary,
    },
    field: {
      gap: 7,
    },
    fieldLabel: {
      ...mobileTextWeighted("caption", "medium"),
      color: mobileColors.textSubtle,
    },
    input: {
      // Explicit regular weight — don't spread a `mobileText.*` token that
      // carries a bold `fontFamily`, since the named family overrides
      // `fontWeight: "400"`. Omitting `fontFamily` also avoids the Android
      // EditText non-interactive bug when DM Sans hasn't loaded.
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "400",
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      color: mobileColors.textPrimary,
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
    iconBadge: {
      alignItems: "center",
      // White rather than a gray tint: the tile is a frame for the glyph, not a
      // second surface, and a gray fill under a black glyph flattens both.
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.borderSubtle,
      // A rounded square, not a circle: 16 on a 32px box is a full circle, and
      // the squircle reads as a tile the icon sits in rather than a bubble.
      borderRadius: 10,
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
