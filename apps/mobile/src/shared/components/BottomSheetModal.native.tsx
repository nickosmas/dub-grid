import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace, mobileTextWeighted } from "../theme/tokens";
import { ActionButtons } from "./ActionButtons";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Pressable } from "./Pressable";
import { ChromeIconButton } from "./ChromeIconButton";
import { ICON_CONTROL_SIZE } from "./icon-control-style";
import {
  BottomSheetModal as DrawnBottomSheetModal,
  InsideSheetContext,
  SheetActions,
  SheetHeader as DrawnSheetHeader,
  type BottomSheetModalProps,
} from "./BottomSheetModalDrawn";

export * from "./BottomSheetModalDrawn";

/**
 * A sheet is only as tall as its content (owner, 2026-10-31); a long one
 * scrolls within this share of the screen, which keeps its title clear of the
 * grabber.
 */
const SCROLL_BODY_MAX_SHARE = 0.62;
/**
 * Room the title row, the footer and the sheet's own insets take, so a body
 * sized to the space above the keyboard leaves the whole sheet in view. The
 * system lifts a fitted sheet onto the keyboard; it never resizes it.
 */
const SHEET_CHROME_ALLOWANCE = 300;
const MIN_SCROLL_BODY = 120;

/** The keyboard's height while it is up, else 0. */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = IS_IOS ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = IS_IOS ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

const IS_IOS = Platform.OS === "ios";

/** A colour at zero alpha: iOS fades a gradient to "transparent" through gray. */
function transparentOf(hex: string): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return `rgba(${r}, ${g}, ${b}, 0)`;
}

type ButtonProps = ComponentProps<typeof Button>;

type SheetClose = {
  onClose: () => void;
  disabled: boolean;
  label: string;
  /** The footer's primary action, drawn in the bar's trailing slot. */
  primary?: ButtonProps;
  /** A second action that isn't a cancel, such as Clear all. */
  secondary?: ButtonProps;
};

const CANCEL_LABELS = new Set(["Cancel", "Close", "Not now", "Back", "Keep editing"]);

type LiftedActions = {
  rest: ReactNode;
  primary?: ButtonProps;
  secondary?: ButtonProps;
  onCancel?: ButtonProps["onPress"];
};

/**
 * Takes a footer's `SheetActions` (a primary `Button` and an optional second
 * one) out of it, so the sheet can draw them in its top bar the way the
 * platform does (owner, 2026-10-31): a Cancel becomes the close button, the
 * primary the trailing action. Anything else in the footer, such as an error
 * line, stays at the bottom. A footer of any other shape is left alone.
 */
function liftSheetActions(node: ReactNode): LiftedActions {
  const lifted: LiftedActions = { rest: node };

  const walk = (child: ReactNode): ReactNode => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{ children?: ReactNode; primaryAction?: ReactNode }>;
    if (element.type === SheetActions || element.type === ActionButtons) {
      const primary = element.props.primaryAction;
      const others = Children.toArray(element.props.children);
      const second = others[0];
      const isButton = (value: unknown): value is ReactElement<ButtonProps> =>
        isValidElement(value) && value.type === Button;
      if (!isButton(primary) || others.length > 1 || (second && !isButton(second))) {
        return child;
      }
      lifted.primary = primary.props;
      if (second) {
        const props = (second as ReactElement<ButtonProps>).props;
        if (props.tone === "plain" || (props.label && CANCEL_LABELS.has(props.label))) {
          lifted.onCancel = props.onPress;
        } else if (!props.disabled) {
          // A second action with nothing to act on (Clear all with no filter
          // set) gives its place back to the close button.
          lifted.secondary = props;
        }
      }
      return null;
    }
    if (element.props.children === undefined) return child;
    const mapped = Children.map(element.props.children, walk) ?? [];
    if ((mapped as unknown[]).every((value) => value == null || value === false)) return null;
    return cloneElement(element, undefined, ...mapped);
  };

  lifted.rest = walk(node);
  return lifted;
}

/** Set inside a native sheet, so its header draws the platform's own bar. */
const SheetCloseContext = createContext<SheetClose | null>(null);

/**
 * The platform's own sheet: SwiftUI's sheet on iOS (the grabber, detents,
 * Liquid Glass on iOS 26) and Material 3's ModalBottomSheet on Android,
 * closed by a swipe down or the scrim. A gate that must
 * hide what is behind it (the app lock) keeps the drawn sheet, whose cover
 * backdrop a native sheet can't give.
 */
export function BottomSheetModal(props: BottomSheetModalProps) {
  const mobileColors = useMobileColors();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const scrollBodyMaxHeight =
    keyboardHeight > 0
      ? Math.max(MIN_SCROLL_BODY, windowHeight - keyboardHeight - SHEET_CHROME_ALLOWANCE)
      : windowHeight * SCROLL_BODY_MAX_SHARE;
  // The native sheet reports every dismissal, including one the caller made by
  // hiding it; only a dismissal while it should be showing is the person's.
  const visibleRef = useRef(props.visible);
  visibleRef.current = props.visible;

  if (props.presentationKind === "gate" || props.backdrop === "cover") {
    return <DrawnBottomSheetModal {...props} />;
  }

  const {
    visible,
    onDismiss,
    dismissDisabled = false,
    scrollable = false,
    header,
    footer,
    overlay,
    children,
  } = props;

  const lifted = liftSheetActions(footer);
  const barFooter = lifted.primary ? lifted.rest : footer;

  return (
    <BottomSheet
      // The grouped page colour, as a system sheet holding a list has: its
      // groups and cards are white on it, with no outline.
      backgroundStyle={{ backgroundColor: mobileColors.background }}
      enableDynamicSizing
      enablePanDownToClose={!dismissDisabled}
      index={visible ? 0 : -1}
      onClose={() => {
        if (visibleRef.current) onDismiss();
      }}
    >
      <InsideSheetContext.Provider value>
        <SheetCloseContext.Provider
          value={{
            onClose: lifted.onCancel ? () => void lifted.onCancel?.(undefined as never) : onDismiss,
            disabled: dismissDisabled,
            label: props.accessibilityLabel ?? "Close",
            primary: lifted.primary,
            secondary: lifted.secondary,
          }}
        >
          {/* A sheet sized to its content lays React Native out without a set
            width, so text in a row never wraps. The app is phone-only, where
            a sheet is as wide as the screen. */}
          <BottomSheetView style={[styles.sheet, { width: windowWidth }]}>
            {header ?? (IS_IOS || lifted.primary ? <SheetHeader title="" /> : null)}
            {scrollable ? (
              <View>
                <BottomSheetScrollView
                  automaticallyAdjustKeyboardInsets
                  contentContainerStyle={[styles.body, styles.bodyScrollEnd]}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: scrollBodyMaxHeight }}
                >
                  {children}
                </BottomSheetScrollView>
                {
                  // The system keeps the home indicator's inset below the
                  // content, so a scrolled list ends on a hard line there; it
                  // fades out instead, as iOS 26's scroll edge effect does.
                  <LinearGradient
                    colors={[transparentOf(mobileColors.background), mobileColors.background]}
                    pointerEvents="none"
                    style={styles.scrollEdge}
                  />
                }
              </View>
            ) : (
              <View style={styles.body}>{children}</View>
            )}
            {barFooter ? (
              <View style={[styles.footer, { borderTopColor: mobileColors.borderSubtle }]}>
                {barFooter}
              </View>
            ) : null}
            {overlay}
          </BottomSheetView>
        </SheetCloseContext.Provider>
      </InsideSheetContext.Provider>
    </BottomSheet>
  );
}

type SheetHeaderProps = ComponentProps<typeof DrawnSheetHeader>;

const HAS_LIQUID_GLASS = IS_IOS && isLiquidGlassAvailable();
const SUBTITLE_IN_BAR_MAX = 32;
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
 * A sheet's title in the platform's own form. iOS puts it in a bar under the
 * grabber: the close button on the leading edge, the title centered with its
 * subtitle under it, and the sheet's action as a tinted glass capsule on the
 * trailing edge (Human Interface Guidelines, Sheets). Material 3 sets the
 * title left-aligned under the drag handle with the action as a text button
 * at the end, and no close button, since a swipe, the scrim and Back close the
 * sheet. Outside a native sheet (the app lock) it is the drawn header.
 */
export function SheetHeader(props: SheetHeaderProps) {
  const close = useContext(SheetCloseContext);
  if (!close) return <DrawnSheetHeader {...props} />;
  if (IS_IOS) return <IosSheetBar subtitle={props.subtitle} title={props.title} />;
  return (
    <View style={styles.materialHeader}>
      <View style={styles.materialTitles}>
        {props.title ? (
          <AppText allowFontScaling={false} numberOfLines={2} variant="screenTitle">
            {props.title}
          </AppText>
        ) : null}
        {props.subtitle ? (
          <AppText tone="secondary" variant="body">
            {props.subtitle}
          </AppText>
        ) : null}
      </View>
      {close.secondary ? <BarAction action={close.secondary} kind="secondary" /> : null}
      {close.primary ? (
        <BarAction action={close.primary} kind="primary" title={props.title} />
      ) : null}
    </View>
  );
}

function IosSheetBar({ title, subtitle }: { title?: string; subtitle?: string }) {
  const mobileColors = useMobileColors();
  const close = useContext(SheetCloseContext);
  // Both sides take the wider one's width, so the title sits on the sheet's
  // centre line however long the action's label is.
  const [sideWidths, setSideWidths] = useState({ leading: 0, trailing: 0 });
  const sideWidth = Math.max(sideWidths.leading, sideWidths.trailing);
  // A short caption, such as a count, sits under the title in the bar; a
  // sentence reads at full width under it instead.
  const subtitleFitsBar = (subtitle?.length ?? 0) <= SUBTITLE_IN_BAR_MAX;
  const measure = (side: "leading" | "trailing") => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setSideWidths((current) => (current[side] === width ? current : { ...current, [side]: width }));
  };

  return (
    <View style={styles.iosHeader}>
      <View style={styles.iosBar}>
        <View style={[styles.iosSide, styles.iosLeading, { minWidth: sideWidth }]}>
          <View onLayout={measure("leading")} style={styles.iosSideContent}>
            {close?.secondary ? (
              <BarAction action={close.secondary} kind="secondary" />
            ) : close ? (
              <ChromeIconButton
                accessibilityLabel={close.label}
                onPress={close.disabled ? () => undefined : close.onClose}
              >
                <Ionicons
                  color={close.disabled ? mobileColors.textSubtle : mobileColors.textPrimary}
                  name="close"
                  size={22}
                />
              </ChromeIconButton>
            ) : null}
          </View>
        </View>
        <View style={styles.iosTitles}>
          {title ? (
            <AppText
              accessibilityRole="header"
              align="center"
              allowFontScaling={false}
              numberOfLines={2}
              variant="cardTitle"
            >
              {title}
            </AppText>
          ) : null}
          {subtitle && subtitleFitsBar ? (
            <AppText align="center" numberOfLines={2} tone="secondary" variant="meta">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.iosSide, styles.iosTrailing, { minWidth: sideWidth }]}>
          <View onLayout={measure("trailing")} style={styles.iosSideContent}>
            {close?.primary ? (
              <BarAction action={close.primary} kind="primary" title={title} />
            ) : null}
          </View>
        </View>
      </View>
      {subtitle && !subtitleFitsBar ? (
        <AppText align="center" tone="secondary" variant="body">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * A footer action moved into the bar: a glass capsule on iOS (tinted for the
 * primary, plain glass for a second action) and a Material text button on
 * Android. It spins while the press's promise runs, as `Button` does.
 */
function BarAction({
  action,
  kind,
  title,
}: {
  action: ButtonProps;
  kind: "primary" | "secondary";
  title?: string;
}) {
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
        style={styles.materialAction}
      >
        {busy ? (
          <ActivityIndicator color={mobileColors.brand} size="small" />
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
  ) : (
    <AppText numberOfLines={1} style={[styles.iosActionLabel, { color: labelColor }]}>
      {label}
    </AppText>
  );

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
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          style={styles.iosAction}
          tintColor={tint}
        >
          {content}
        </GlassView>
      ) : (
        <View
          style={[styles.iosAction, { backgroundColor: tint ?? mobileColors.controlNeutralBg }]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // iOS: the system grabber sits above the bar. Android: the drag handle
  // brings its own space. The system adds the home indicator's inset at the
  // bottom of a sheet sized to its content.
  sheet: {
    paddingTop: IS_IOS ? 0 : mobileSpace.xs,
    paddingBottom: mobileSpace.sm,
  },
  // Equal leading and trailing columns keep the title on the sheet's centre
  // line whatever the two sides hold.
  iosHeader: {
    gap: mobileSpace.sm,
    paddingHorizontal: mobileSpace.lg,
    paddingBottom: mobileSpace.md,
  },
  iosBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.sm,
    minHeight: ICON_CONTROL_SIZE + mobileSpace.sm,
  },
  iosSide: {
    flexDirection: "row",
  },
  iosSideContent: {
    flexDirection: "row",
  },
  iosLeading: {
    justifyContent: "flex-start",
  },
  iosTrailing: {
    justifyContent: "flex-end",
  },
  iosTitles: {
    flex: 1,
    alignItems: "center",
  },
  iosAction: {
    minWidth: ICON_CONTROL_SIZE + mobileSpace.lg,
    height: ICON_CONTROL_SIZE + mobileSpace.xs,
    borderRadius: (ICON_CONTROL_SIZE + mobileSpace.xs) / 2,
    paddingHorizontal: mobileSpace.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  iosActionLabel: {
    ...mobileTextWeighted("body", "semibold"),
  },
  materialHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.sm,
    paddingHorizontal: mobileSpace.xl,
    paddingBottom: mobileSpace.md,
  },
  materialTitles: {
    flex: 1,
    gap: mobileSpace.xs,
  },
  materialAction: {
    minHeight: ICON_CONTROL_SIZE,
    paddingHorizontal: mobileSpace.md,
    justifyContent: "center",
  },
  materialActionLabel: {
    ...mobileTextWeighted("bodyStrong", "semibold"),
  },
  bodyScrollEnd: {
    paddingBottom: mobileSpace["2xl"],
  },
  scrollEdge: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: mobileSpace["2xl"],
  },
  body: {
    paddingHorizontal: mobileSpace.xl,
    paddingBottom: mobileSpace.lg,
    gap: mobileSpace.lg,
  },
  footer: {
    gap: mobileSpace.md,
    borderTopWidth: 1,
    paddingHorizontal: mobileSpace.xl,
    paddingTop: mobileSpace.md,
  },
});
