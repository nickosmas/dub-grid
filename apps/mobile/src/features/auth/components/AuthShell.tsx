import type { ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DubGridWordmark } from "../../../shared/components/DubGridWordmark";
import { GradientBackdrop } from "../../../shared/components/GradientBackdrop";
import { getScreenBottomPadding } from "../../../shared/components/screen-layout";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace } from "../../../shared/theme/tokens";

/**
 * Keeps the form readable on tablets without stretching the fields. The brand
 * header shares it so the two share a left edge.
 */
const MAX_COLUMN_WIDTH = 380;

/**
 * The frame every public auth screen sits in: brand header, gradient halo,
 * keyboard-aware scroll, and a centred max-width column.
 *
 * Shared so sign-in, forgot-password and reset-password read as one flow rather
 * than three screens that happen to be adjacent. The keyboard accessory is
 * owned by the caller, because each screen wires its own fields to it.
 */
export function AuthShell({
  children,
  footer,
  onBrandLongPress,
}: {
  children: ReactNode;
  /** Rendered outside the scroll view, e.g. the shared keyboard Done bar. */
  footer?: ReactNode;
  /** Dev-only escape hatch used by sign-in to reset first-run state. */
  onBrandLongPress?: () => void;
}) {
  const mobileColors = useMobileColors();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: mobileColors.background }]}>
      {/* Sits behind the brand header and fades out before the fields start. */}
      <GradientBackdrop height="100%" kind="aurora" />
      {/* Constrained to the same column as the fields below, so the logo's left
          edge lines up with the copy instead of drifting out on wide screens. */}
      <View style={styles.brandRow}>
        <Pressable style={styles.brandHeader} onLongPress={onBrandLongPress}>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="DubGrid logo"
            source={require("../../../../assets/images/logo-blue.png")}
            style={styles.brandMark}
          />
          <DubGridWordmark color={mobileColors.textPrimary} fontSize={20} />
        </Pressable>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardArea}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: getScreenBottomPadding("stack", insets.bottom) },
          ]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      {footer}
    </SafeAreaView>
  );
}

/** Title + supporting line above a stage's fields. */
export function AuthHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <View style={styles.header}>
      {title}
      {subtitle}
    </View>
  );
}

/** One stage of a flow: header, then fields, then actions. */
export function AuthStage({ children }: { children: ReactNode }) {
  return <View style={styles.stage}>{children}</View>;
}

export function AuthFields({ children }: { children: ReactNode }) {
  return <View style={styles.fields}>{children}</View>;
}

export function AuthActions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  brandRow: {
    alignItems: "center",
    paddingHorizontal: mobileSpace["2xl"],
    paddingTop: mobileSpace.sm,
    paddingBottom: mobileSpace.xs,
  },
  brandHeader: {
    width: "100%",
    maxWidth: MAX_COLUMN_WIDTH,
    flexDirection: "row",
    alignItems: "center",
    gap: mobileSpace.sm,
  },
  brandMark: {
    width: 28,
    height: 28,
  },
  keyboardArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    // Deliberately top-aligned, not centred: a vertically centred form jumps
    // as the keyboard opens and as stages change height.
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: mobileSpace["2xl"],
    paddingTop: 72,
  },
  column: {
    width: "100%",
    maxWidth: MAX_COLUMN_WIDTH,
    gap: 36,
  },
  stage: {
    gap: mobileSpace["2xl"],
  },
  header: {
    gap: mobileSpace.xs,
  },
  fields: {
    gap: mobileSpace.md,
  },
  actions: {
    gap: mobileSpace.lg,
  },
});
