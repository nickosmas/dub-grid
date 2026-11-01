import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Text } from "../../../shared/components/Text";
import { Button, type ButtonTone } from "../../../shared/components/Button";
import { AppSwitch } from "../../../shared/components/AppSwitch";
import { AccessInsignia } from "../../../shared/components/AccessInsignia";
import { SelectionCheck } from "../../../shared/components/SelectionCheck";
import { SelectionCheckbox } from "../../../shared/components/SelectionCheckbox";
import { IS_ANDROID_LIST, IS_IOS_LIST, IS_NATIVE_LIST } from "../../../shared/lib/native-list";
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
  titleAdornment,
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
  /** Drawn right after the name, such as the status icon. */
  titleAdornment?: ReactNode;
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
                  {titleAdornment}
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
      {title ? (
        <Text
          style={[
            styles.sectionTitle,
            IS_IOS_LIST && styles.sectionTitleIos,
            IS_ANDROID_LIST && styles.sectionTitleAndroid,
          ]}
        >
          {title}
        </Text>
      ) : null}
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

  // On iOS a panel holding fields is a grouped form: a white card of rows,
  // each a label and its value, with separators only between them. Anything
  // else in it, such as password hints, is a padded row of its own.
  const rows = Children.toArray(children);
  const isField = (child: ReactNode) => isValidElement(child) && child.type === ProfileTextInput;
  if (IS_IOS_LIST && rows.some(isField)) {
    return (
      <View style={[styles.list, insideSheet ? styles.flatInSheet : null, style]}>
        <View style={styles.listClip}>
          <FormRowContext.Provider value>
            {rows.map((row, index) => (
              <View key={(row as ReactElement).key ?? index}>
                {isField(row) ? row : <View style={styles.formExtraRow}>{row}</View>}
                {index < rows.length - 1 ? <View style={styles.insetDivider} /> : null}
              </View>
            ))}
          </FormRowContext.Provider>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.panel, insideSheet ? styles.flatInSheet : null, style]}>{children}</View>
  );
}

/** Set by a panel of fields, whose card and separators the rows sit in. */
const FormRowContext = createContext(false);

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
    <View
      style={[
        styles.row,
        IS_NATIVE_LIST && styles.rowNative,
        !isLast && !IS_NATIVE_LIST && styles.rowDivider,
      ]}
    >
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
      {!isLast && IS_NATIVE_LIST ? (
        <View style={[styles.insetDivider, iconName ? styles.insetDividerIcon : null]} />
      ) : null}
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
      style={[
        styles.row,
        styles.navRow,
        IS_NATIVE_LIST && styles.rowNative,
        !isLast && !IS_NATIVE_LIST && styles.rowDivider,
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
      <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={22} />
      {!isLast && IS_NATIVE_LIST ? (
        <View style={[styles.insetDivider, styles.insetDividerIcon]} />
      ) : null}
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
  const inFormRow = useContext(FormRowContext);
  const insideSheet = useIsInsideSheet();
  const nativeInputStyle = IS_ANDROID_LIST ? styles.inputAndroid : null;

  if (IS_IOS_LIST) {
    // A grouped-form row as Contacts draws one (owner, 2026-10-31): the
    // field's name is its placeholder, left-aligned, so it is said once and
    // gives way to what is typed. A multi-line field keeps a placeholder of
    // its own when it has one.
    const multiline = Boolean(resolvedInputProps.multiline);
    const shownPlaceholder = multiline ? (resolvedInputProps.placeholder ?? label) : label;
    const input = (
      <TextInput
        accessibilityLabel={resolvedInputProps.accessibilityLabel ?? label}
        {...resolvedInputProps}
        inputAccessoryViewID={inputAccessoryViewID}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholder={shownPlaceholder}
        placeholderTextColor={mobileColors.textSubtle}
        selectionColor={mobileColors.brand}
        style={[
          styles.iosFieldInput,
          multiline ? styles.iosFieldMultiline : styles.iosFieldValue,
          textInputStyle,
          inputStyle,
        ]}
      />
    );
    return (
      <View style={containerStyle}>
        <View style={inFormRow ? null : [styles.list, insideSheet ? styles.flatInSheet : null]}>
          {multiline ? (
            input
          ) : (
            <View style={styles.iosFieldRow}>
              {input}
              {trailingAccessory ? (
                <View style={styles.inputAccessory}>{trailingAccessory}</View>
              ) : null}
            </View>
          )}
          {error ? <Text style={[styles.errorText, styles.iosFieldError]}>{error}</Text> : null}
        </View>
        {keyboardDoneAccessory}
      </View>
    );
  }

  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {trailingAccessory ? (
        <View
          style={[
            styles.inputShell,
            nativeInputStyle,
            focused && (IS_ANDROID_LIST ? styles.inputFocusedAndroid : styles.inputFocused),
            error && styles.inputError,
          ]}
        >
          <TextInput
            // The visible <Text> label isn't associated with the input on
            // native, so without this the field is announced unlabeled.
            accessibilityLabel={resolvedInputProps.accessibilityLabel ?? label}
            {...resolvedInputProps}
            inputAccessoryViewID={inputAccessoryViewID}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            placeholderTextColor={mobileColors.textSubtle}
            selectionColor={mobileColors.brand}
            style={[
              styles.input,
              nativeInputStyle,
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
          selectionColor={mobileColors.brand}
          style={[
            styles.input,
            nativeInputStyle,
            resolvedInputProps.multiline && styles.inputMultiline,
            focused && (IS_ANDROID_LIST ? styles.inputFocusedAndroid : styles.inputFocused),
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
    /** A muted line under the name, saying what the choice means. */
    detail?: string;
    abbr?: string | null;
    disabled?: boolean;
    disabledReason?: string;
    /** Drawn before the name, such as the icon of the status a choice leads to. */
    leading?: ReactNode;
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
      {label ? (
        <Text
          style={
            IS_IOS_LIST
              ? [styles.sectionTitle, styles.sectionTitleIos]
              : IS_ANDROID_LIST
                ? [styles.sectionTitle, styles.sectionTitleAndroid]
                : [styles.fieldLabel, styles.choiceGroupLabel]
          }
        >
          {label}
        </Text>
      ) : null}
      <View style={[styles.list, insideSheet ? styles.flatInSheet : null]}>
        <View style={styles.listClip}>
          {items.map((item, index) => {
            const selected = selectedIds.includes(item.id);
            return (
              <PressableRow
                accessibilityLabel={[item.name, item.detail, item.disabledReason]
                  .filter(Boolean)
                  .join(". ")}
                accessibilityRole={selection === "single" ? "radio" : "checkbox"}
                checked={selected}
                disabled={item.disabled}
                key={item.id}
                onPress={() => onToggle(item.id)}
                style={[
                  styles.choiceRow,
                  index < items.length - 1 && !IS_NATIVE_LIST && styles.rowDivider,
                ]}
              >
                {item.leading}
                {item.detail ? (
                  <View style={styles.choiceText}>
                    <Text
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                      style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}
                    >
                      {item.name}
                    </Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.rowDetail}>
                      {item.detail}
                    </Text>
                  </View>
                ) : (
                  <Text
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}
                  >
                    {item.name}
                  </Text>
                )}
                {IS_NATIVE_LIST ? (
                  selection === "single" ? (
                    <SelectionCheck selected={selected} />
                  ) : (
                    <SelectionCheckbox checked={selected} />
                  )
                ) : (
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
                )}
                {index < items.length - 1 && IS_NATIVE_LIST ? (
                  <View style={styles.insetDivider} />
                ) : null}
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

  if (IS_NATIVE_LIST) {
    // A native list's row icon is the glyph alone, in the list's ink.
    return (
      <View style={styles.iconPlain}>
        <Ionicons color={semanticColor ?? mobileColors.textSecondary} name={name} size={22} />
      </View>
    );
  }

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
    gap: IS_NATIVE_LIST ? mobileSpace.sm : mobileSpace.md,
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
  // The same break above the foot's actions as the drawn stack takes.
  actionGroup: {
    paddingTop: mobileSpace.lg,
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
 *
 * On a phone it is the tile Contacts puts under a name: the glyph over its
 * word in the tint, on a small white tile of the grouped page.
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
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (IS_NATIVE_LIST) {
    const tint = disabled ? mobileColors.textSubtle : mobileColors.brand;
    return (
      <PressableRow disabled={disabled} onPress={onPress} style={styles.quickTile}>
        <Ionicons color={tint} name={icon} size={20} />
        <Text fit="compact" numberOfLines={1} style={[styles.quickTileLabel, { color: tint }]}>
          {label}
        </Text>
      </PressableRow>
    );
  }

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

/**
 * An action in a list card: its words in the tint, or in red when it takes
 * something away, the way Settings draws Sign Out or Contacts Delete Contact.
 */
export function ProfileListAction({
  label,
  tone = "brand",
  disabled = false,
  loading = false,
  accessibilityLabel,
  isLast = false,
  align = "leading",
  trailing,
  onPress,
}: {
  label: string;
  tone?: "brand" | "danger";
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  isLast?: boolean;
  /** Centered for a lone row in its own group, as Sign Out is. */
  align?: "leading" | "center";
  /** Drawn at the row's end, such as the chevron of a row that opens more. */
  trailing?: ReactNode;
  onPress: () => void | Promise<unknown>;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const color = tone === "danger" ? mobileColors.dangerText : mobileColors.brand;

  return (
    <PressableRow
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.actionRow, align === "center" && styles.actionRowCentered]}
    >
      <Text
        fit="compact"
        numberOfLines={1}
        style={[styles.actionRowLabel, align === "leading" && styles.actionRowLabelFill, { color }]}
      >
        {label}
      </Text>
      {loading ? <ActivityIndicator color={color} size="small" /> : trailing}
      {!isLast ? <View style={styles.insetDivider} /> : null}
    </PressableRow>
  );
}

export interface ProfileActionItem {
  key: string;
  label: string;
  onPress: () => void;
  tone?: "brand" | "danger";
  /** The drawn button's tone, off the platforms' own lists. */
  buttonTone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Actions that end a page: on a phone a list card of tinted rows, Revoke and
 * the like in red; elsewhere one full-width button each.
 */
export function ProfileActionGroup({ actions }: { actions: ProfileActionItem[] }) {
  if (actions.length === 0) return null;
  if (IS_NATIVE_LIST) {
    return (
      <View style={personLayoutStyles.actionGroup}>
        <ProfileList>
          {actions.map((action, index) => (
            <ProfileListAction
              disabled={action.disabled}
              isLast={index === actions.length - 1}
              key={action.key}
              label={action.label}
              loading={action.loading}
              onPress={action.onPress}
              tone={action.tone}
            />
          ))}
        </ProfileList>
      </View>
    );
  }
  return (
    <ProfileActionStack>
      {actions.map((action) => (
        <Button
          disabled={action.disabled}
          key={action.key}
          label={action.label}
          loading={action.loading}
          onPress={action.onPress}
          tone={action.buttonTone ?? (action.tone === "danger" ? "danger" : "secondary")}
        />
      ))}
    </ProfileActionStack>
  );
}

/** A setting with a switch at the row's end, in a list card. */
export function ProfileSwitchRow({
  label,
  detail,
  accessibilityLabel,
  value,
  disabled = false,
  isLast = false,
  onValueChange,
}: {
  label: string;
  detail?: string;
  accessibilityLabel: string;
  value: boolean;
  disabled?: boolean;
  isLast?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={[styles.switchRow, !isLast && !IS_NATIVE_LIST && styles.rowDivider]}>
      <View style={styles.rowCopy}>
        <Text style={styles.switchLabel}>{label}</Text>
        {detail ? <Text style={styles.switchDetail}>{detail}</Text> : null}
      </View>
      <AppSwitch
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
      />
      {!isLast && IS_NATIVE_LIST ? <View style={styles.insetDivider} /> : null}
    </View>
  );
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
  });

export function useProfilePrimitiveStyles() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  return useMemo(() => createProfilePrimitiveStyles(mobileColors), [mobileColors, isDark]);
}

/**
 * A grouped list card's edge: none on the gray page in light mode, a hairline
 * in dark, where the card and the page are close.
 */
export function groupedCardEdge(mobileColors: MobileColors, isDark: boolean): ViewStyle {
  if (!IS_NATIVE_LIST) return { borderColor: mobileColors.cardBorder, borderWidth: 1 };
  return {
    borderColor: isDark ? mobileColors.borderSubtle : "transparent",
    borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
  };
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
      ...(IS_NATIVE_LIST ? mobileText.meta : mobileText.caption),
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
    // iOS: a grouped list's header at the system's increased prominence,
    // the title of the group in the text colour rather than a small gray
    // caption (owner, 2026-10-31: no text too small to read comfortably).
    sectionTitleIos: {
      ...mobileTextWeighted("sectionTitle", "semibold"),
      color: mobileColors.textPrimary,
    },
    // Material 3: a list subheader in the brand colour.
    sectionTitleAndroid: {
      ...mobileTextWeighted("body", "semibold"),
      color: mobileColors.brand,
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
      // A native sheet is the grouped gray, where the white card needs no edge.
      borderColor: IS_NATIVE_LIST ? "transparent" : mobileColors.borderSubtle,
    },
    panel: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      gap: mobileSpace.md,
      padding: 16,
      ...mobileElevation("card", isDark),
      ...groupedCardEdge(mobileColors, isDark),
    },
    // The clip sits on an inner view: iOS drops a view's own shadow when the
    // same view clips its children, so the shadow-casting list stays unclipped
    // and the rows are clipped to the corners one level down.
    list: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      ...mobileElevation("card", isDark),
      ...groupedCardEdge(mobileColors, isDark),
    },
    listClip: {
      overflow: "hidden",
      borderRadius: IS_NATIVE_LIST ? mobileRadii.card : mobileRadii.card - 1,
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
    // A native list row: the platform's height, its separator drawn inset.
    rowNative: {
      minHeight: 52,
      paddingVertical: mobileSpace.md,
    },
    insetDivider: {
      position: "absolute",
      bottom: 0,
      right: 0,
      left: 16,
      height: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
    },
    // Starts at the text, past the icon column (16 + 28 + 12).
    insetDividerIcon: {
      left: 56,
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
      ...(IS_NATIVE_LIST ? mobileText.meta : mobileText.caption),
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
    // iOS: a form field is text on the group's own surface, with a hairline
    // under it, not a box.
    formExtraRow: {
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
    },
    iosFieldRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      minHeight: 52,
      paddingHorizontal: 16,
    },
    iosFieldInput: {
      ...mobileInputText("regular"),
      fontSize: mobileText.body.fontSize,
      color: mobileColors.textPrimary,
    },
    iosFieldValue: {
      flex: 1,
      minWidth: 0,
      paddingVertical: mobileSpace.md,
    },
    iosFieldMultiline: {
      lineHeight: mobileText.body.lineHeight,
      minHeight: 96,
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
      textAlignVertical: "top",
    },
    iosFieldError: {
      paddingHorizontal: 16,
      paddingBottom: mobileSpace.md,
    },
    // Material 3's outlined text field.
    inputAndroid: {
      backgroundColor: "transparent",
      borderColor: mobileColors.textMuted,
      borderRadius: 4,
    },
    inputFocusedAndroid: {
      borderColor: mobileColors.brand,
      borderWidth: 2,
    },
    inputFocused: {
      backgroundColor: mobileColors.surface,
      borderColor: mobileColors.brand,
    },
    inputError: {
      borderColor: mobileColors.dangerText,
    },
    errorText: {
      ...(IS_NATIVE_LIST ? mobileText.meta : mobileText.caption),
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
    choiceText: {
      flex: 1,
      gap: mobileSpace.xs,
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
    quickTile: {
      alignItems: "center",
      backgroundColor: mobileColors.surface,
      borderRadius: 12,
      flex: 1,
      gap: mobileSpace.xs,
      justifyContent: "center",
      maxWidth: 160,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.sm,
      ...groupedCardEdge(mobileColors, isDark),
    },
    quickTileLabel: {
      ...mobileTextWeighted("meta", "medium"),
    },
    actionRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
    },
    actionRowCentered: {
      justifyContent: "center",
    },
    actionRowLabel: {
      ...mobileText.rowTitle,
      flexShrink: 1,
    },
    actionRowLabelFill: {
      flex: 1,
    },
    switchRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
    },
    switchLabel: {
      ...(IS_NATIVE_LIST ? mobileText.rowTitle : mobileTextWeighted("cardTitle", "medium")),
      color: mobileColors.textPrimary,
    },
    switchDetail: {
      ...(IS_NATIVE_LIST ? mobileText.meta : mobileText.body),
      color: mobileColors.textMuted,
    },
    iconPlain: {
      alignItems: "center",
      justifyContent: "center",
      width: 28,
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
