import { useEffect, useMemo, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "./AppText";
import { InsideSheetContext, SheetActions } from "./BottomSheetModal";
import { Button, type ButtonTone } from "./Button";
import { InlineError } from "./InlineError";
import { Pressable } from "./Pressable";
import { hapticImpact } from "../lib/haptics";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useMotionPreference } from "../motion/useMotionPreference";
import { mobileElevation, mobileRadii, mobileSpace, type MobileColors } from "../theme/tokens";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";

type ConfirmationTone = Extract<
  ButtonTone,
  "primary" | "secondary" | "neutral" | "danger" | "warning"
>;

/** How far the card sits below full size while hidden, and settles from. */
const CARD_ENTRANCE_SCALE = 0.92;

/**
 * The app's one confirmation surface: a centered popup over a scrim, not a
 * bottom sheet.
 *
 * It used to be built on `BottomSheetModal`, which meant every yes/no prompt
 * in the app - sign out, discard changes, remove a person - slid up as a full
 * sheet. That's the same surface a form or a picker opens, so a screen that
 * already had a sheet open answered its own "are you sure?" with a second
 * one, and the sheet stopped reading as a distinct, bigger interaction. A
 * popup is a smaller, unambiguous interruption, and it can sit on top of an
 * open sheet without tripping the sheet stacking guard, because it no longer
 * is one - it does not report itself to `trackSheetPresentation`.
 */
export function ConfirmationModal({
  visible,
  title,
  body,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "primary",
  error,
  loading,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: ConfirmationTone;
  /**
   * Why the last confirm failed, shown above the actions.
   *
   * A confirmation that stays open on failure has to say why *here*: this is a
   * `<Modal>`, its own native window, so a toast pushed from the caller's error
   * handler renders in the root window behind it and is never seen. Without
   * this the button simply stopped spinning and nothing else happened.
   */
  error?: string | null;
  /**
   * Overrides the busy state `Button` works out for itself. Only needed when
   * the pending flag lives outside this popup; an async `onConfirm` already
   * spins on its own.
   */
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<unknown>;
}) {
  const isDestructive = confirmTone === "danger";
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  // A real pixel value, not `maxHeight: "80%"`: that string only resolves
  // against a parent with a settled height, and `card`'s own parent
  // (`avoider`) has none of its own - it shrinks to fit `card`, which is
  // exactly what `card` is trying to bound. Yoga's percentage math against an
  // indeterminate ancestor can't be relied on, and empirically collapsed the
  // ScrollView below to a sliver, clipping the body text against the footer.
  // `BottomSheetModal` sidesteps the same trap by measuring the window itself.
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(
    () => createStyles(mobileColors, isDark, windowHeight),
    [mobileColors, isDark, windowHeight],
  );
  const { spring, timing } = useMotionPreference();

  // The popup latches the confirm itself rather than leaving it to `Button`,
  // because the busy state has a second job here: a pending confirmation must
  // also refuse to be tapped away. Doing it in one place keeps the spinner
  // and the backdrop's dismissal reading from the same flag.
  const confirm = useAsyncAction(() => {
    if (isDestructive) {
      hapticImpact("medium");
    }
    return onConfirm();
  });
  const isBusy = loading ?? confirm.isRunning;

  const cardScale = useSharedValue(CARD_ENTRANCE_SCALE);
  const cardOpacity = useSharedValue(0);
  // Resolved once per config change on the JS thread, not inside the worklet
  // below - a worklet that calls `spring`/`timing` itself throws, since both
  // are plain functions Reanimated can't run on the UI thread.
  const enterSpring = useMemo(() => spring("bouncy"), [spring]);
  const fade = useMemo(() => timing("standard", 180), [timing]);

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, enterSpring);
      cardOpacity.value = withTiming(1, fade);
    } else {
      cardScale.value = withTiming(CARD_ENTRANCE_SCALE, fade);
      cardOpacity.value = withTiming(0, fade);
    }
  }, [visible, enterSpring, fade, cardScale, cardOpacity]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const handleDismiss = () => {
    if (isBusy) return;
    onCancel();
  };

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={handleDismiss}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <InsideSheetContext.Provider value>
        <View style={styles.root}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop]} />
          {/* Tapping outside dismisses, so there is nothing to tap when the
              confirmation is busy. */}
          {isBusy ? null : (
            <Pressable
              accessibilityLabel="Dismiss"
              accessibilityRole="button"
              style={StyleSheet.absoluteFill}
              onPress={handleDismiss}
            />
          )}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            pointerEvents="box-none"
            style={styles.avoider}
          >
            <Animated.View accessibilityRole="alert" style={[styles.card, cardAnimatedStyle]}>
              <View style={styles.header}>
                <AppText align="center" variant="cardTitle">
                  {title}
                </AppText>
              </View>
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.scrollArea}
              >
                {body ? (
                  <AppText align="center" tone="secondary" variant="body">
                    {body}
                  </AppText>
                ) : null}
                {children}
                {error ? <InlineError message={error} /> : null}
              </ScrollView>
              {/* Outside the ScrollView so the confirm/cancel actions stay put
                  regardless of how much the popup's body has to scroll. */}
              <View style={styles.footer}>
                <SheetActions>
                  <Button
                    label={confirmLabel}
                    loading={isBusy}
                    onPress={confirm.run}
                    tone={confirmTone}
                  />
                  <Button disabled={isBusy} label={cancelLabel} onPress={onCancel} tone="neutral" />
                </SheetActions>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </InsideSheetContext.Provider>
    </Modal>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean, windowHeight: number) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: mobileSpace.xl,
    },
    backdrop: {
      backgroundColor: mobileColors.overlay,
    },
    avoider: {
      width: "100%",
      maxWidth: 400,
      alignItems: "center",
    },
    card: {
      width: "100%",
      // A cap, not a fixed height: most confirmations are two lines and a
      // button stack, and a popup that always ran to 80% of the screen would
      // read as an oversized sheet wearing a different corner radius. A real
      // pixel value, not the string "80%" - see the comment where
      // `windowHeight` is read, above.
      maxHeight: windowHeight * 0.8,
      // Load-bearing, not decorative: without it Yoga has no bounded height
      // to hand the ScrollView below, and the ScrollView can collapse
      // instead of sizing to its content, clipping the body text against the
      // footer's divider. `BottomSheetModal`'s own `sheet` carries the same
      // `flexShrink: 1` for the same reason.
      flexShrink: 1,
      borderRadius: mobileRadii.card,
      backgroundColor: mobileColors.surface,
      overflow: "hidden",
      ...mobileElevation("overlay", isDark),
    },
    header: {
      paddingHorizontal: mobileSpace.xl,
      paddingTop: mobileSpace.xl,
      paddingBottom: mobileSpace.sm,
    },
    scrollArea: {
      flexShrink: 1,
    },
    body: {
      paddingHorizontal: mobileSpace.xl,
      paddingBottom: mobileSpace.lg,
      gap: mobileSpace.sm,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: mobileColors.borderSubtle,
      paddingHorizontal: mobileSpace.xl,
      paddingTop: 14,
      paddingBottom: mobileSpace.xl,
    },
  });
