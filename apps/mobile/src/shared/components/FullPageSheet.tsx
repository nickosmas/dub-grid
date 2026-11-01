import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  type LayoutChangeEvent,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { registerModalPresentation } from "../lib/modal-presentation";
import { IS_IOS_LIST, IS_NATIVE_LIST } from "../lib/native-list";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace, type MobileColors } from "../theme/tokens";
import { AppText } from "./AppText";
import { InsideSheetContext } from "./BottomSheetModal";
import { ChromeIconButton } from "./ChromeIconButton";
import { createIconControlStyle, ICON_CONTROL_SIZE } from "./icon-control-style";
import { Pressable } from "./Pressable";
import { liftSheetActions, type ButtonProps } from "./sheet-bar-actions";
import { BarAction } from "./SheetBarAction";
import { AppLockOverlay } from "./AppLockSurface";
import { useAppLockSurface } from "../lib/app-lock";

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
 *
 * On iOS and Android the footer's `SheetActions` move into the top bar, as
 * `BottomSheetModal` does (owner, 2026-10-31): the X closes, the primary is
 * the trailing action (a checkmark when it only saves), and a Back is a
 * worded item beside the X, so one tap still closes the whole task. The web
 * build keeps the footer.
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

  const lockEngaged = useAppLockSurface().engaged;
  const handleDismiss = () => {
    if (dismissDisabled || lockEngaged) return;
    onDismiss();
  };

  const lifted = IS_NATIVE_LIST ? liftSheetActions(footer) : null;
  const bodyFooter = lifted?.primary ? lifted.rest : footer;
  const back = lifted?.cancel?.label === "Back" ? lifted.cancel : undefined;
  const onCancel = lifted?.onCancel;
  const close = () => {
    if (onCancel && !back) void onCancel(undefined as never);
    else handleDismiss();
  };

  return (
    <Modal
      allowSwipeDismissal={!dismissDisabled && !hasUnsavedChanges && !lockEngaged}
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={handleDismiss}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      statusBarTranslucent
      visible={visible}
    >
      <InsideSheetContext.Provider value>
        <View style={styles.root}>
          {IS_NATIVE_LIST ? (
            <NativeSheetBar
              back={back}
              closeDisabled={dismissDisabled}
              onClose={close}
              primary={lifted?.primary}
              secondary={lifted?.secondary}
              subtitle={subtitle}
              title={title}
            />
          ) : (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <AppText fit="fixed" variant="screenTitle">
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
          )}
          <ScrollView
            contentContainerStyle={[styles.body, bodyFooter ? styles.bodyWithFooter : null]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            {children}
          </ScrollView>
          {bodyFooter ? <View style={styles.footer}>{bodyFooter}</View> : null}
          {overlay}
          <AppLockOverlay />
        </View>
      </InsideSheetContext.Provider>
    </Modal>
  );
}

/**
 * The sheet's top bar on iOS and Android. iOS centres the title between the
 * leading X (and Back) and the trailing action, both sides as wide as
 * the wider one; Android is Material 3's full-screen dialog bar, the title
 * left-aligned after the leading icon and the action at the end.
 */
function NativeSheetBar({
  title,
  subtitle,
  back,
  primary,
  secondary,
  closeDisabled,
  onClose,
}: {
  title: string;
  subtitle?: string;
  back?: ButtonProps;
  primary?: ButtonProps;
  secondary?: ButtonProps;
  closeDisabled: boolean;
  onClose: () => void;
}) {
  const mobileColors = useMobileColors();
  const { top: topInset } = useSafeAreaInsets();
  const [sideWidths, setSideWidths] = useState({ leading: 0, trailing: 0 });
  const sideWidth = IS_IOS_LIST ? Math.max(sideWidths.leading, sideWidths.trailing) : 0;
  const measure = (side: "leading" | "trailing") => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width);
    setSideWidths((current) => (current[side] === width ? current : { ...current, [side]: width }));
  };

  const closeColor = closeDisabled ? mobileColors.textSubtle : mobileColors.textPrimary;

  return (
    <View style={[barStyles.bar, !IS_IOS_LIST && { paddingTop: topInset + mobileSpace.sm }]}>
      <View style={[barStyles.side, { minWidth: sideWidth }]}>
        <View onLayout={measure("leading")} style={barStyles.sideContent}>
          <ChromeIconButton accessibilityLabel="Close" disabled={closeDisabled} onPress={onClose}>
            {IS_IOS_LIST ? (
              <Ionicons color={closeColor} name="close" size={22} />
            ) : (
              <MaterialIcons color={closeColor} name="close" size={24} />
            )}
          </ChromeIconButton>
          {back ? <BarAction action={back} kind="secondary" /> : null}
        </View>
      </View>
      <View style={IS_IOS_LIST ? barStyles.iosTitles : barStyles.materialTitles}>
        <AppText
          accessibilityRole="header"
          align={IS_IOS_LIST ? "center" : undefined}
          fit="fixed"
          numberOfLines={IS_IOS_LIST ? 2 : 1}
          variant={IS_IOS_LIST ? "cardTitle" : "title"}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText
            align={IS_IOS_LIST ? "center" : undefined}
            numberOfLines={2}
            tone="secondary"
            variant="meta"
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={[barStyles.side, barStyles.trailing, { minWidth: sideWidth }]}>
        <View onLayout={measure("trailing")} style={barStyles.sideContent}>
          {secondary ? <BarAction action={secondary} kind="secondary" /> : null}
          {primary ? <BarAction action={primary} kind="primary" title={title} /> : null}
        </View>
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  // A pageSheet already sits below the status bar; on Android the modal is
  // its own window and takes the inset itself.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.sm,
    minHeight: ICON_CONTROL_SIZE + mobileSpace.sm,
    paddingHorizontal: mobileSpace.lg,
    paddingTop: mobileSpace.md,
    paddingBottom: mobileSpace.md,
  },
  side: {
    flexDirection: "row",
  },
  sideContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.sm,
  },
  trailing: {
    justifyContent: "flex-end",
  },
  iosTitles: {
    flex: 1,
    alignItems: "center",
  },
  materialTitles: {
    flex: 1,
    gap: mobileSpace.xs,
  },
});

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
