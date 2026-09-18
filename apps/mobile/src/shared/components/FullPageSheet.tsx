import { useEffect, useMemo, useRef, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { registerModalPresentation } from "../lib/modal-presentation";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileSpace, type MobileColors } from "../theme/tokens";
import { AppText } from "./AppText";
import { InsideSheetContext } from "./BottomSheetModal";
import { createIconControlStyle } from "./icon-control-style";
import { Pressable } from "./Pressable";

/**
 * A task that needs the whole page: the platform's card-style sheet.
 *
 * `BottomSheetModal` is for a short choice; a task that scrolls through
 * weeks and lists of teammates was squeezed into it and read as a popup that
 * had grown too big. This is the other surface: on iOS a `pageSheet` that
 * slides up over the tab bar, shows the page behind it receding, and
 * dismisses with the system's own downward swipe; on Android a full-screen
 * slide. It has a real header with a Close button, so the way out is always
 * on screen, and the same `onDismiss` funnel as the bottom sheet, so an
 * unsaved-changes guard can veto every exit the same way.
 *
 * The swipe is the system's, and UIKit decides whether it completes. While
 * the sheet is clean it may: the card leaves, `onRequestClose` fires, and the
 * caller drops `visible`. With unsaved changes the swipe is refused, so the
 * card bounces back and UIKit reports the attempt through the same
 * `onRequestClose`; the guard then raises its discard question inside the
 * still-presented card via `overlay`. Neither path re-presents the Modal:
 * remounting a live card here made UIKit refuse the replacement ("already
 * presenting") and the sheet vanished with its state still open.
 *
 * Registers as a task `sheet`, so it obeys the one-task-sheet rule and a
 * confirmation may still sit on top of it.
 */
export function FullPageSheet({
  visible,
  onDismiss,
  title,
  subtitle,
  dismissDisabled = false,
  hasUnsavedChanges = false,
  footer,
  overlay,
  children,
}: {
  visible: boolean;
  /** Every exit (Close, the swipe, Android back) comes through here. */
  onDismiss: () => void;
  title: string;
  subtitle?: string;
  /** A request in flight: Close disables and the swipe is refused. */
  dismissDisabled?: boolean;
  /**
   * The system swipe is refused while true, so the guard's discard question
   * can be raised over a card that is still on screen.
   */
  hasUnsavedChanges?: boolean;
  footer?: ReactNode;
  /**
   * Drawn over the whole card, header and footer included: a confirmation
   * raised from inside the sheet. It cannot be a Modal of its own, because
   * UIKit will not present a second controller while the page sheet is up.
   */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(mobileColors, isDark, insets.top, insets.bottom),
    [mobileColors, isDark, insets.top, insets.bottom],
  );

  const titleRef = useRef(title);
  titleRef.current = title;
  useEffect(() => {
    if (!visible) return;
    return registerModalPresentation("sheet", titleRef.current);
  }, [visible]);

  const handleDismiss = () => {
    if (dismissDisabled) return;
    onDismiss();
  };

  return (
    <Modal
      allowSwipeDismissal={!dismissDisabled && !hasUnsavedChanges}
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={handleDismiss}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      statusBarTranslucent
      visible={visible}
    >
      <InsideSheetContext.Provider value>
        <View style={styles.root}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText maxFontSizeMultiplier={MAX_FONT_SCALE} variant="screenTitle">
                {title}
              </AppText>
              {subtitle ? (
                <AppText tone="secondary" variant="body">
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              accessibilityState={{ disabled: dismissDisabled }}
              disabled={dismissDisabled}
              hitSlop={10}
              onPress={handleDismiss}
              style={[styles.closeButton, dismissDisabled && styles.closeButtonDisabled]}
            >
              <Ionicons color={mobileColors.textPrimary} name="close" size={20} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={[styles.body, footer ? styles.bodyWithFooter : null]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
          {overlay}
        </View>
      </InsideSheetContext.Provider>
    </Modal>
  );
}

const createStyles = (
  mobileColors: MobileColors,
  isDark: boolean,
  topInset: number,
  bottomInset: number,
) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.md,
      paddingHorizontal: mobileSpace.xl,
      // A pageSheet already sits below the status bar; on Android the modal
      // is its own window and needs the inset itself.
      paddingTop: Platform.OS === "ios" ? mobileSpace["2xl"] : mobileSpace["2xl"] + topInset,
      paddingBottom: mobileSpace.md,
    },
    headerCopy: {
      flex: 1,
      gap: mobileSpace.xs,
      // Centres a one-line title on the close button.
      minHeight: 44,
      justifyContent: "center",
    },
    closeButton: {
      ...createIconControlStyle(mobileColors, isDark),
    },
    closeButtonDisabled: {
      opacity: 0.4,
    },
    scroll: {
      flex: 1,
    },
    body: {
      paddingHorizontal: mobileSpace.xl,
      paddingBottom: mobileSpace["2xl"] + bottomInset,
      gap: mobileSpace.lg,
    },
    bodyWithFooter: {
      paddingBottom: mobileSpace.lg,
    },
    footer: {
      gap: mobileSpace.md,
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingHorizontal: mobileSpace.xl,
      paddingTop: mobileSpace.md,
      paddingBottom: mobileSpace["2xl"] + bottomInset,
    },
  });
