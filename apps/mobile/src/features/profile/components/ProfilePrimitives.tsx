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
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Text } from "../../../shared/components/Text";
import { Button } from "../../../shared/components/Button";
import { AccessInsignia } from "../../../shared/components/AccessInsignia";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useIsInsideSheet } from "../../../shared/components/BottomSheetModal";
import { useKeyboardDoneAccessory } from "../../../shared/components/KeyboardDoneAccessory";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileListRow,
  mobileAvatarText,
  MAX_FONT_SCALE,
  mobileElevation,
  mobileIconToneColor,
  mobileInputText,
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
  type MobileIconToneName,
  mobileSpace,
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
  /**
   * The access insignia beside the name: the crown or star is the whole of
   * how a hero states the tier. A pill under the name used to spell it out
   * as well, User included, and read as a second heading. Plain users and
   * members with no account get none.
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
  const hasIdentity = Boolean(initials || title || subtitle);

  return (
    <ProfileHeroAlignContext.Provider value={align}>
      <View style={[styles.hero, style]}>
        {hasIdentity ? (
          <View style={[styles.heroTop, isCentered && styles.heroTopCentered]}>
            {initials ? (
              <View style={[styles.avatar, isCentered && styles.avatarLarge, avatarStyle]}>
                <Text
                  fit="fixed"
                  style={[styles.avatarText, isCentered && styles.avatarTextLarge, avatarTextStyle]}
                >
                  {initials}
                </Text>
              </View>
            ) : null}
            <View style={[styles.heroCopy, isCentered && styles.heroCopyCentered]}>
              {title ? (
                <View style={[styles.heroTitleRow, isCentered && styles.heroTitleRowCentered]}>
                  <Text
                    numberOfLines={2}
                    style={[styles.heroTitle, isCentered && styles.heroTitleCentered]}
                  >
                    {title}
                  </Text>
                  <AccessInsignia orgRole={orgRole} size={isCentered ? "lg" : "sm"} />
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
      <View style={variant === "plain" ? null : styles.listClip}>{children}</View>
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
            maxFontSizeMultiplier={MAX_FONT_SCALE}
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
          maxFontSizeMultiplier={MAX_FONT_SCALE}
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
      {error ? <Text style={[styles.errorText, styles.choiceGroupLabel]}>{error}</Text> : null}
    </View>
  );
}

/**
 * A group of choices as a framed list, the Settings idiom: a caption over
 * full-width rows, a trailing mark that fills when a row is chosen. Rows
 * wrap long names where a chip cloud ragged and truncated them, and the
 * idle mark says which kind of group this is: a ring on every row for
 * pick-many, nothing until the chosen row for pick-one.
 */
export function ProfileChoiceGroup<TId extends string | number>({
  label,
  items,
  selectedIds,
  selection = "multiple",
  error,
  onToggle,
}: {
  /**
   * Omit for a lone list under a sheet whose title already names it. Inside a
   * page section, where several groups sit under one title, each keeps its
   * own.
   */
  label?: string;
  items: Array<{
    id: TId;
    name: string;
    abbr?: string | null;
    disabled?: boolean;
    disabledReason?: string;
  }>;
  selectedIds: TId[];
  /** `"single"` for a group where choosing one row replaces the last. */
  selection?: "single" | "multiple";
  error?: string | null;
  onToggle: (id: TId) => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  // The same flattening `ProfileList` does: a sheet is one flat surface, and
  // a shadow on a list inside it was both against the rule and clipped by
  // the sheet's own scroll edges.
  const insideSheet = useIsInsideSheet();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.choiceGroup}>
      {label ? <Text style={[styles.fieldLabel, styles.choiceGroupLabel]}>{label}</Text> : null}
      <View style={[styles.list, insideSheet ? styles.flatInSheet : null]}>
        <View style={styles.listClip}>
          {items.map((item, index) => {
            const selected = selectedIds.includes(item.id);
            return (
              <PressableRow
                accessibilityLabel={
                  item.disabledReason ? `${item.name}. ${item.disabledReason}` : item.name
                }
                accessibilityRole={selection === "single" ? "radio" : "checkbox"}
                checked={selected}
                disabled={item.disabled}
                key={item.id}
                onPress={() => onToggle(item.id)}
                style={[styles.choiceRow, index < items.length - 1 && styles.rowDivider]}
              >
                <Text
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}
                >
                  {item.name}
                </Text>
                <View
                  style={[
                    styles.choiceMark,
                    selection === "multiple" && !selected && styles.choiceMarkRing,
                    selected && styles.choiceMarkSelected,
                  ]}
                >
                  {selected ? (
                    <Ionicons color={mobileColors.onBrandText} name="checkmark" size={14} />
                  ) : null}
                </View>
              </PressableRow>
            );
          })}
        </View>
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
    gap: mobileSpace.md,
    justifyContent: "center",
    paddingBottom: 16,
  },
  actionStack: {
    gap: mobileSpace.md,
    // Twice the 12 an action group opens above its buttons, on top of the 20
    // the screen puts between sections: these end the page rather than
    // sitting among sibling rows, so they take the wider break.
    paddingTop: mobileSpace["2xl"],
  },
  actionRow: {
    flexDirection: "row",
    gap: mobileSpace.md,
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
 * The contact pair directly under the hero: Call and Email, always both, as
 * tiles the reader can name at a glance. Everything that manages the person
 * lives at the foot of the page instead.
 */
export function ProfileQuickActions({ children }: { children: ReactNode }) {
  return <View style={personLayoutStyles.quickActions}>{children}</View>;
}

/**
 * One pill in `ProfileQuickActions`: the neutral `plain` button with its
 * glyph beside its name, so the button says what it does without a tap. The
 * colour is the icon's. A pill with nothing to act on stays in place, dimmed,
 * so the pair keeps its shape whether or not a phone or email is on file.
 */
export function ProfileQuickAction({
  icon,
  iconTone,
  label,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  iconTone: MobileIconToneName;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const isDark = useIsDarkMode();

  return (
    <Button
      compact
      disabled={disabled}
      label={label}
      leadingAccessory={
        <Ionicons color={mobileIconToneColor(iconTone, isDark)} name={icon} size={18} />
      }
      onPress={onPress}
      tone="plain"
    />
  );
}

/** The management actions at the foot of a person page, one full-width button each. */
export function ProfileActionStack({ children }: { children: ReactNode }) {
  return <View style={personLayoutStyles.actionStack}>{children}</View>;
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
      gap: mobileSpace.md,
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
      gap: mobileSpace.md,
      paddingTop: 4,
    },
    heroTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
    },
    heroTopCentered: {
      flexDirection: "column",
      gap: mobileSpace.md,
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
      ...mobileAvatarText(64),
      color: mobileColors.textInverse,
    },
    avatarTextLarge: {
      ...mobileAvatarText(96),
    },
    heroCopy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    // Stretched rather than flexed: in a column `flex: 1` would stretch the
    // copy down the cross axis instead of sizing it to its text.
    heroCopyCentered: {
      alignItems: "center",
      alignSelf: "stretch",
      flexBasis: "auto",
      flexGrow: 0,
      gap: mobileSpace.sm,
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
      fontSize: mobileText.display.fontSize,
      lineHeight: mobileText.display.lineHeight,
      textAlign: "center",
    },
    heroSubtitle: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    heroSubtitleCentered: {
      textAlign: "center",
    },
    heroDetail: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileSpace.md,
    },
    heroDetailCentered: {
      alignItems: "center",
      justifyContent: "center",
    },
    heroMetaItem: {
      flex: 1,
      gap: mobileSpace.xs,
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
      gap: mobileSpace.md,
    },
    // Sentence case, like every other heading in the app; the small caps
    // read as a different voice above a card of sentence-case rows. Inset
    // from the card's edge the way a grouped list's header is, so the title
    // sits over the rows' content rather than flush with the card corner.
    sectionTitle: {
      ...mobileTextWeighted("sectionTitle", "medium"),
      color: mobileColors.textSubtle,
      paddingHorizontal: mobileSpace.lg,
      // Air above a title that follows another section's card; the card's
      // own gap below the title stays at the section's `gap`.
      paddingTop: mobileSpace.sm,
    },
    sectionDescription: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      paddingHorizontal: mobileSpace.lg,
      marginTop: -4,
    },
    // Cancels the card shadow when this is rendered inside a sheet, and hands
    // the edge to a hairline instead. On the page the shadow is the whole edge,
    // which is why `cardBorder` is transparent in light mode; dropping the
    // shadow here without putting something back left these with no edge at all
    // there. Dark is unchanged, since `cardBorder` already resolves to
    // `borderSubtle`.
    flatInSheet: {
      boxShadow: undefined,
      shadowOpacity: 0,
      elevation: 0,
      borderColor: mobileColors.borderSubtle,
    },
    panel: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: mobileSpace.md,
      padding: 16,
      ...mobileElevation("card", isDark),
    },
    // The clip sits on an inner view: iOS drops a view's own shadow when the
    // same view clips its children, so the shadow-casting list stays unclipped
    // and the rows are clipped to the corners one level down.
    list: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.cardBorder,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      ...mobileElevation("card", isDark),
    },
    listClip: {
      overflow: "hidden",
      borderRadius: mobileRadii.card - 1,
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
      gap: mobileSpace.xs,
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
      gap: mobileSpace.sm,
    },
    fieldLabel: {
      ...mobileTextWeighted("caption", "medium"),
      color: mobileColors.textSubtle,
    },
    input: {
      ...mobileInputText("regular"),
      fontSize: mobileText.input.fontSize,
      lineHeight: mobileText.input.lineHeight,
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      color: mobileColors.textPrimary,
      minHeight: 48,
      paddingHorizontal: mobileSpace.md,
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
      paddingRight: mobileSpace.sm,
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
    choiceGroup: {
      gap: mobileSpace.sm,
    },
    // The one `fieldLabel` that sits outside a panel. Inside one the panel's
    // padding lines the label up with its input; out here the same inset the
    // section title and the rows take keeps "Employment" on the line
    // "Staffing" and "Full-time" share, rather than flush with the card's edge.
    choiceGroupLabel: {
      paddingHorizontal: mobileSpace.lg,
    },
    choiceRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      paddingHorizontal: 16,
      paddingVertical: mobileListRow.paddingVertical,
    },
    choiceLabel: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
      flex: 1,
      minWidth: 0,
    },
    choiceLabelSelected: {
      ...mobileTextWeighted("body", "medium"),
    },
    // The 22pt mark at the row's end. A ring is the pick-many group's idle
    // state; the fill is the chosen row in either kind of group.
    choiceMark: {
      alignItems: "center",
      borderRadius: 11,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    choiceMarkRing: {
      borderColor: mobileColors.border,
      borderWidth: 1.5,
    },
    choiceMarkSelected: {
      backgroundColor: mobileColors.brand,
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
