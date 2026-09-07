import { ActionButtons } from "./ActionButtons";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { AppText } from "./AppText";
import { InsideSheetContext } from "./BottomSheetModal";
import { Button, type ButtonTone } from "./Button";
import { InlineError } from "./InlineError";
import { Pressable } from "./Pressable";
import { registerModalPresentation } from "../lib/modal-presentation";
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
const CARD_ENTRANCE_SCALE = 0.98;

/**
 * The glyph for each tone's icon badge. Outline, not solid: this app's own
 * convention (`StatusBanner`'s `centeredIconName`) reaches for the outline
 * variant whenever an icon is the prominent, standalone focus rather than a
 * small accent beside text - the same role this badge plays here.
 */
const CONFIRMATION_ICON_NAME: Record<ConfirmationTone, keyof typeof Ionicons.glyphMap> = {
  primary: "checkmark-circle-outline",
  secondary: "checkmark-circle-outline",
  neutral: "information-circle-outline",
  danger: "warning-outline",
  warning: "warning-outline",
};

/**
 * Background/border/icon colour for the tone badge, mirroring
 * `StatusBanner`'s tone-to-colour mapping (`dangerSoft`/`dangerBorder`/
 * `dangerText`, etc.) rather than inventing a second one. `neutral` has no
 * matching semantic-soft token in the palette, so it composes the same
 * control-surface tokens `Button`'s own neutral tone already uses.
 */
function getConfirmationIconColors(tone: ConfirmationTone, mobileColors: MobileColors) {
  switch (tone) {
    case "danger":
      return {
        background: mobileColors.dangerSoft,
        border: mobileColors.dangerBorder,
        icon: mobileColors.dangerText,
      };
    case "warning":
      return {
        background: mobileColors.warningSoft,
        border: mobileColors.warningBorder,
        icon: mobileColors.warningText,
      };
    case "neutral":
      return {
        background: mobileColors.controlNeutralBg,
        border: mobileColors.borderSubtle,
        icon: mobileColors.textSecondary,
      };
    case "primary":
    case "secondary":
    default:
      return {
        background: mobileColors.brandSoft,
        border: mobileColors.brandBorder,
        icon: mobileColors.brand,
      };
  }
}

/** A brief consequence decision. Editable tasks belong in a sheet or page. */
export function ConfirmationModal({
  visible,
  title,
  body,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "primary",
  iconName,
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
  iconName?: keyof typeof Ionicons.glyphMap;
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
   * Adds the caller's pending state to the popup's async latch. Only needed when
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
  const presentationName = useRef(title);
  useEffect(() => {
    if (visible) return registerModalPresentation("confirmation", presentationName.current);
  }, [visible]);
  const styles = useMemo(
    () => createStyles(mobileColors, isDark, windowHeight),
    [mobileColors, isDark, windowHeight],
  );
  const iconColors = useMemo(
    () => getConfirmationIconColors(confirmTone, mobileColors),
    [confirmTone, mobileColors],
  );
  const { timing } = useMotionPreference();

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
  const isBusy = Boolean(loading || confirm.isRunning);

  const cardScale = useSharedValue(CARD_ENTRANCE_SCALE);
  const cardOpacity = useSharedValue(0);
  // Resolve the motion configuration outside the UI-thread worklet.
  const fade = useMemo(() => timing("standard", 180), [timing]);

  useEffect(() => {
    if (visible) {
      cardScale.value = withTiming(1, fade);
      cardOpacity.value = withTiming(1, fade);
    } else {
      cardScale.value = withTiming(CARD_ENTRANCE_SCALE, fade);
      cardOpacity.value = withTiming(0, fade);
    }
  }, [visible, fade, cardScale, cardOpacity]);

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
                <View
                  style={[
                    styles.iconBadge,
                    { backgroundColor: iconColors.background, borderColor: iconColors.border },
                  ]}
                >
                  <Ionicons
                    color={iconColors.icon}
                    name={iconName ?? CONFIRMATION_ICON_NAME[confirmTone]}
                    size={24}
                  />
                </View>
                <AppText align="center" variant="sectionTitle">
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
              {/* Keep actions visible while the body scrolls. */}
              <View style={styles.footer}>
                <ActionButtons
                  primaryAction={
                    <Button
                      label={confirmLabel}
                      loading={isBusy}
                      onPress={confirm.run}
                      tone={confirmTone}
                    />
                  }
                >
                  <Button
                    disabled={isBusy}
                    label={cancelLabel}
                    onPress={handleDismiss}
                    tone="plain"
                  />
                </ActionButtons>
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
      alignItems: "center",
      paddingHorizontal: mobileSpace.xl,
      paddingTop: mobileSpace["2xl"],
      paddingBottom: mobileSpace.sm,
    },
    iconBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: mobileSpace.md,
    },
    scrollArea: {
      flexShrink: 1,
    },
    body: {
      paddingHorizontal: mobileSpace.xl,
      paddingBottom: mobileSpace.lg,
      gap: mobileSpace.sm,
    },
    // No top divider: unlike a sheet, this card has no scrollable body long
    // enough to need a permanent "more below" cue, and the mockup this
    // redesign matches separates the actions with space alone.
    footer: {
      paddingHorizontal: mobileSpace.xl,
      paddingTop: mobileSpace.sm,
      paddingBottom: mobileSpace.xl,
    },
  });
