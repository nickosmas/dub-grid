import { useEffect, useMemo, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpacing, type MobileColors } from "../theme/tokens";

const PULSE_DURATION_MS = 900;

export function SkeletonBlock({
  height,
  width = "100%",
  radius = 14,
  style,
}: {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const pulse = useRef(new Animated.Value(0)).current;
  const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) {
        setIsReduceMotionEnabled(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setIsReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (isReduceMotionEnabled) {
      pulse.setValue(1);
      return undefined;
    }

    pulse.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: PULSE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: PULSE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [isReduceMotionEnabled, pulse]);

  const opacity = isReduceMotionEnabled
    ? 0.72
    : pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.5, 0.92],
      });

  return (
    <Animated.View
      style={[
        styles.block,
        {
          height,
          opacity,
          width,
          borderRadius: radius,
        },
        style,
      ]}
    />
  );
}

export function HeroSkeleton() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View testID="hero-skeleton" style={styles.heroCard}>
      <SkeletonBlock height={16} width="34%" />
      <SkeletonBlock height={34} radius={18} />
      <SkeletonBlock height={16} width="48%" />
      <View style={styles.heroRow}>
        <SkeletonBlock height={44} radius={18} style={styles.heroButton} />
        <SkeletonBlock height={44} radius={18} style={styles.heroButton} />
      </View>
    </View>
  );
}

export function ListSkeleton({
  rows = 3,
  showSectionHeader = true,
}: {
  rows?: number;
  showSectionHeader?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View testID="list-skeleton" style={styles.section}>
      {showSectionHeader ? (
        <View style={styles.sectionHeader}>
          <SkeletonBlock height={18} width="32%" />
          <SkeletonBlock height={14} width="20%" />
        </View>
      ) : null}
      {Array.from({ length: rows }).map((_, index) => (
        <View key={`skeleton-row-${index}`} style={styles.listCard}>
          <View style={styles.listRow}>
            <SkeletonBlock height={18} width="58%" />
            <SkeletonBlock height={28} width={84} radius={14} />
          </View>
          <SkeletonBlock height={15} width="76%" />
          <SkeletonBlock height={15} width="42%" />
        </View>
      ))}
    </View>
  );
}

export function DetailSkeleton({ sections = 2 }: { sections?: number }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View testID="detail-skeleton" style={styles.section}>
      <View style={styles.detailCard}>
        <View style={styles.detailHeader}>
          <SkeletonBlock height={28} width="48%" />
          <SkeletonBlock height={56} width={64} radius={20} />
        </View>
        <SkeletonBlock height={16} width="56%" />
        <SkeletonBlock height={16} width="34%" />
        <View style={styles.detailActionRow}>
          <SkeletonBlock height={42} radius={18} style={styles.detailAction} />
          <SkeletonBlock height={42} radius={18} style={styles.detailAction} />
        </View>
      </View>
      {Array.from({ length: sections }).map((_, index) => (
        <View key={`detail-skeleton-${index}`} style={styles.detailSection}>
          <SkeletonBlock height={18} width="28%" />
          <View style={styles.detailListCard}>
            <SkeletonBlock height={16} width="44%" />
            <SkeletonBlock height={15} width="72%" />
            <SkeletonBlock height={15} width="38%" />
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) => StyleSheet.create({
  block: {
    backgroundColor: mobileColors.borderSubtle,
  },
  section: {
    gap: mobileSpacing.sectionGap,
  },
  heroCard: {
    paddingVertical: 4,
    gap: 12,
  },
  heroRow: {
    flexDirection: "row",
    gap: 10,
  },
  heroButton: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  listCard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: mobileColors.borderSubtle,
    paddingVertical: 14,
    gap: 10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailCard: {
    paddingVertical: 4,
    gap: 12,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  detailActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  detailAction: {
    flex: 1,
  },
  detailSection: {
    gap: 10,
  },
  detailListCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: mobileColors.borderSubtle,
    paddingVertical: 14,
    gap: 10,
  },
});
