import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
 * Registers as a task `sheet`, so it obeys the one-task-sheet rule and a
 * confirmation may still sit on top of it.
 */
export function FullPageSheet({
  visible,
  onDismiss,
  title,
  subtitle,
  dismissDisabled = false,
  footer,
  children,
}: {
  visible: boolean;
  /** Every exit (Close, the swipe, Android back) comes through here. */
  onDismiss: () => void;
  title: string;
  subtitle?: string;
  /** A request in flight: Close disables and the swipe is refused. */
  dismissDisabled?: boolean;
  footer?: ReactNode;
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

  // iOS reports a completed swipe-down through `onRequestClose` after the
  // card has already left the screen. If the caller keeps `visible` true (a
  // guard raising its discard question), the modal has to be presented again,
  // which React Native only does on a fresh mount: bump the key. Android's
  // back button reaches the same handler without dismissing anything, so it
  // never remounts.
  //
  // The Close button must not take that path. The card is still on screen,
  // and a remount tears it down while the guard's confirmation is presenting
  // from inside it; iOS then refuses to present the new card ("already
  // presenting") and the sheet vanishes with its state still open.
  const [presentation, setPresentation] = useState(0);
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  const handleClose = () => {
    if (dismissDisabled) return;
    onDismiss();
  };
  const handleRequestClose = () => {
    if (dismissDisabled) return;
    onDismiss();
    if (Platform.OS === "ios") {
      setTimeout(() => {
        if (visibleRef.current) setPresentation((count) => count + 1);
      }, 0);
    }
  };

  return (
    <Modal
      key={presentation}
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={handleRequestClose}
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
              onPress={handleClose}
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
