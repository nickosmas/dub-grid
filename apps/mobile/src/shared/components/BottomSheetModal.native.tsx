import { useRef } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace } from "../theme/tokens";
import { ChromeIconButton } from "./ChromeIconButton";
import {
  BottomSheetModal as DrawnBottomSheetModal,
  InsideSheetContext,
  type BottomSheetModalProps,
} from "./BottomSheetModalDrawn";

export * from "./BottomSheetModalDrawn";

/**
 * A sheet that scrolls opens at full height, like a system form sheet, so the
 * keyboard never pushes its title and actions off the screen; a sheet sized to
 * its content is lifted whole when a field takes focus.
 */
const SCROLLING_SNAP_POINTS = ["100%"];

/**
 * The platform's own sheet: SwiftUI's sheet on iOS (the grabber, detents,
 * Liquid Glass on iOS 26) and Material 3's ModalBottomSheet on Android,
 * closed by a swipe down or the scrim. A gate that must
 * hide what is behind it (the app lock) keeps the drawn sheet, whose cover
 * backdrop a native sheet can't give.
 */
export function BottomSheetModal(props: BottomSheetModalProps) {
  const mobileColors = useMobileColors();
  const { width: windowWidth } = useWindowDimensions();
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
      backgroundStyle={{ backgroundColor: mobileColors.surface }}
      enableDynamicSizing={!scrollable}
      enablePanDownToClose={!dismissDisabled}
      index={visible ? 0 : -1}
      snapPoints={scrollable ? SCROLLING_SNAP_POINTS : undefined}
      onClose={() => {
        if (visibleRef.current) onDismiss();
      }}
    >
      <InsideSheetContext.Provider value>
        {/* A sheet sized to its content lays React Native out without a set
            width, so text in a row never wraps. The app is phone-only, where
            a sheet is as wide as the screen. */}
        <BottomSheetView
          style={[styles.sheet, scrollable && styles.sheetFill, { width: windowWidth }]}
        >
          {/* The one visible way out, beside the title: a sheet holding unsaved
              input answers its swipe with a discard question, so it needs a
              control that closes it. Kept, disabled, while the sheet is busy. */}
          <View style={styles.headerRow}>
            <View style={styles.headerContent}>{header}</View>
            <ChromeIconButton
              accessibilityLabel={props.accessibilityLabel ?? "Close"}
              onPress={dismissDisabled ? () => undefined : onDismiss}
            >
              <Ionicons
                color={dismissDisabled ? mobileColors.textSubtle : mobileColors.textPrimary}
                name="close"
                size={20}
              />
            </ChromeIconButton>
          </View>
          {scrollable ? (
            <BottomSheetScrollView
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              style={styles.scroll}
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
      </InsideSheetContext.Provider>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Clear of the system grabber at the top; the system adds the home
  // indicator's inset at the bottom of a sheet sized to its content.
  sheet: {
    paddingTop: mobileSpace["2xl"] + mobileSpace.md,
    paddingBottom: mobileSpace.sm,
  },
  sheetFill: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.md,
    paddingHorizontal: mobileSpace.xl,
    paddingBottom: mobileSpace.md,
  },
  headerContent: {
    flex: 1,
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
