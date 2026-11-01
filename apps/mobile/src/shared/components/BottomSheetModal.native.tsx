import { createContext, useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace } from "../theme/tokens";
import { AppText } from "./AppText";
import { ChromeIconButton } from "./ChromeIconButton";
import { ICON_CONTROL_SIZE } from "./icon-control-style";
import {
  BottomSheetModal as DrawnBottomSheetModal,
  InsideSheetContext,
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

type SheetClose = { onClose: () => void; disabled: boolean; label: string };

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
            onClose: onDismiss,
            disabled: dismissDisabled,
            label: props.accessibilityLabel ?? "Close",
          }}
        >
          {/* A sheet sized to its content lays React Native out without a set
            width, so text in a row never wraps. The app is phone-only, where
            a sheet is as wide as the screen. */}
          <BottomSheetView style={[styles.sheet, { width: windowWidth }]}>
            {header ?? (IS_IOS ? <IosSheetBar /> : null)}
            {scrollable ? (
              <BottomSheetScrollView
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: scrollBodyMaxHeight }}
              >
                {children}
              </BottomSheetScrollView>
            ) : (
              <View style={styles.body}>{children}</View>
            )}
            {footer ? (
              <View style={[styles.footer, { borderTopColor: mobileColors.borderSubtle }]}>
                {footer}
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

/**
 * A sheet's title in the platform's own form. iOS puts it in a bar under the
 * grabber, centered, with the close button on the leading edge (Human
 * Interface Guidelines, Sheets); Material 3 sets it left-aligned under the
 * drag handle with no close button, since a swipe, the scrim and Back close
 * the sheet. Outside a native sheet (the app lock) it is the drawn header.
 */
export function SheetHeader(props: SheetHeaderProps) {
  const close = useContext(SheetCloseContext);
  if (!close) return <DrawnSheetHeader {...props} />;
  if (IS_IOS) return <IosSheetBar subtitle={props.subtitle} title={props.title} />;
  return (
    <View style={styles.materialHeader}>
      <AppText allowFontScaling={false} numberOfLines={2} variant="screenTitle">
        {props.title}
      </AppText>
      {props.subtitle ? (
        <AppText tone="secondary" variant="body">
          {props.subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

function IosSheetBar({ title, subtitle }: { title?: string; subtitle?: string }) {
  const mobileColors = useMobileColors();
  const close = useContext(SheetCloseContext);

  return (
    <View style={styles.iosHeader}>
      <View style={styles.iosBar}>
        {close ? (
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
        <AppText
          accessibilityRole="header"
          align="center"
          allowFontScaling={false}
          numberOfLines={2}
          style={styles.iosTitle}
          variant="cardTitle"
        >
          {title}
        </AppText>
        <View style={styles.iosBarBalance} />
      </View>
      {subtitle ? (
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
  iosHeader: {
    gap: mobileSpace.xs,
    paddingHorizontal: mobileSpace.lg,
    paddingBottom: mobileSpace.md,
  },
  iosBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.sm,
    minHeight: ICON_CONTROL_SIZE + mobileSpace.sm,
  },
  iosTitle: {
    flex: 1,
  },
  iosBarBalance: {
    width: ICON_CONTROL_SIZE,
  },
  materialHeader: {
    gap: mobileSpace.xs,
    paddingHorizontal: mobileSpace.xl,
    paddingBottom: mobileSpace.md,
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
