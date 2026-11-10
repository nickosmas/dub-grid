import { createContext, useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace } from "../theme/tokens";
import { AppText } from "./AppText";
import { ChromeIconButton } from "./ChromeIconButton";
import { ICON_CONTROL_SIZE } from "./icon-control-style";
import { liftSheetActions, type ButtonProps } from "./sheet-bar-actions";
import { sheetOpenSize, type SheetSizes } from "./sheet-open-size";
import { BarAction } from "./SheetBarAction";
import {
  BottomSheetModal as DrawnBottomSheetModal,
  InsideSheetContext,
  SheetHeader as DrawnSheetHeader,
  type BottomSheetModalProps,
} from "./BottomSheetModalDrawn";

export * from "./BottomSheetModalDrawn";

/**
 * A sheet is only as tall as its content (owner, 2026-10-31), and opens tall
 * enough to show all of it; only content taller than the screen opens the
 * sheet full height and scrolls (owner, 2026-11-02).
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
/** iOS 26 floats a sheet that isn't full height above the screen's foot. */
const IOS_FLOATING_SHEETS = IS_IOS && Number.parseInt(String(Platform.Version), 10) >= 26;

type SheetClose = {
  onClose: () => void;
  disabled: boolean;
  label: string;
  /** The footer's primary action, drawn in the bar's trailing slot. */
  primary?: ButtonProps;
  /** A second action that isn't a cancel, such as Clear all. */
  secondary?: ButtonProps;
};

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
  const { bottom: bottomInset, top: topInset } = useSafeAreaInsets();
  const scrollBodyMaxHeight =
    keyboardHeight > 0
      ? Math.max(MIN_SCROLL_BODY, windowHeight - keyboardHeight - SHEET_CHROME_ALLOWANCE)
      : windowHeight * SCROLL_BODY_MAX_SHARE;
  // The native sheet reports every dismissal, including one the caller made by
  // hiding it; only a dismissal while it should be showing is the person's.
  const visibleRef = useRef(props.visible);
  visibleRef.current = props.visible;
  const [sizes, setSizes] = useState<SheetSizes>({ header: 0, content: 0, footer: 0 });
  const measure = (part: keyof SheetSizes, value: number) => {
    const rounded = Math.ceil(value);
    setSizes((current) => (current[part] === rounded ? current : { ...current, [part]: rounded }));
  };
  const androidResizableRef = useRef<boolean | null>(null);

  if (props.presentationKind === "gate" || props.backdrop === "cover") {
    return <DrawnBottomSheetModal {...props} />;
  }

  const {
    visible,
    onDismiss,
    dismissDisabled = false,
    scrollable = false,
    expandable = false,
    header,
    footer,
    overlay,
    children,
  } = props;

  const lifted = liftSheetActions(footer);
  const barFooter = lifted.primary ? lifted.rest : footer;
  const { overflows, resizable, snapPoints } = sheetOpenSize({
    isIos: IS_IOS,
    floating: IOS_FLOATING_SHEETS,
    sizes,
    hasBarFooter: Boolean(barFooter),
    bottomInset,
    topInset,
    windowHeight,
    scrollable,
    expandable,
    androidResizable: androidResizableRef.current,
  });
  // Android's sheet is either sized to its content or full screen, and
  // changing how it is sized remounts its content, so the choice holds while
  // it shows.
  if (!visible) androidResizableRef.current = null;
  else if (androidResizableRef.current === null) androidResizableRef.current = overflows;

  return (
    <BottomSheet
      // The grouped page colour, as a system sheet holding a list has: its
      // groups and cards are white on it, with no outline.
      backgroundStyle={{ backgroundColor: mobileColors.background }}
      enableDynamicSizing={!resizable}
      enablePanDownToClose={!dismissDisabled}
      index={visible ? 0 : -1}
      onClose={() => {
        if (visibleRef.current) onDismiss();
      }}
      snapPoints={snapPoints}
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
          <BottomSheetView
            style={[styles.sheet, { width: windowWidth }, resizable && styles.sheetFill]}
          >
            <View onLayout={(event) => measure("header", event.nativeEvent.layout.height)}>
              {header ?? (IS_IOS || lifted.primary ? <SheetHeader title="" /> : null)}
            </View>
            {scrollable ? (
              <BottomSheetScrollView
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={[
                  styles.body,
                  !barFooter && { paddingBottom: bottomInset + mobileSpace.lg },
                ]}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={(_width, height) => measure("content", height)}
                // With nothing below it, the list runs on under the home
                // indicator, as a system sheet's does, rather than stopping
                // on a hard line above the system's bottom inset.
                style={[
                  resizable ? styles.scrollFill : { maxHeight: scrollBodyMaxHeight },
                  !barFooter && { marginBottom: -bottomInset },
                ]}
              >
                {children}
              </BottomSheetScrollView>
            ) : (
              <View style={styles.body}>{children}</View>
            )}
            {barFooter ? (
              <View
                onLayout={(event) => measure("footer", event.nativeEvent.layout.height)}
                style={[styles.footer, { borderTopColor: mobileColors.borderSubtle }]}
              >
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

const SUBTITLE_IN_BAR_MAX = 32;
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

const styles = StyleSheet.create({
  // iOS: the system grabber sits above the bar. Android: the drag handle
  // brings its own space. The system adds the home indicator's inset at the
  // bottom of a sheet sized to its content.
  sheet: {
    paddingTop: IS_IOS ? 0 : mobileSpace.xs,
    paddingBottom: mobileSpace.sm,
  },
  // Sized by a detent, the sheet is a set height and its list takes what the
  // title and footer leave.
  sheetFill: {
    flex: 1,
  },
  scrollFill: {
    flex: 1,
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
