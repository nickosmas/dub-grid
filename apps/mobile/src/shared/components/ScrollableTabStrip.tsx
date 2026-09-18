import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { NumericBadge } from "./NumericBadge";
import { Pressable } from "./Pressable";
import { hapticSelection } from "../lib/haptics";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { getScreenGutter } from "./screen-layout";
import { SkeletonBlock } from "./skeleton";
import {
  mobileControl,
  mobilePillOverflow,
  mobileRadii,
  mobileSpace,
  mobileSpacing,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

export type ScrollableTab = {
  key: string;
  label: string;
  /** Optional count badge. Omit entirely for strips that don't count anything. */
  count?: number;
};

/**
 * The offset the strip must scroll to for `tab` to sit fully in view, or null
 * when it already is.
 *
 * Tab offsets are absolute (measured inside the content container), so they
 * only say whether a tab is clipped once compared against where the strip is
 * actually scrolled to. Comparing them against 0 makes the left-clipped case
 * unrepresentable, since no tab can start before the content container's own
 * leading gutter.
 */
export function getTabScrollIntoViewOffset({
  scrollOffset,
  tab,
  viewportWidth,
}: {
  scrollOffset: number;
  tab: { x: number; width: number };
  viewportWidth: number;
}): number | null {
  if (viewportWidth === 0) return null;

  // Breathing room left beside the tab once it is scrolled in.
  const gutter = getScreenGutter();
  const leftAlignedOffset = Math.max(tab.x - gutter, 0);
  const rightAlignedOffset = tab.x + tab.width + gutter - viewportWidth;

  // Only scroll when the tab is actually clipped, so selecting an already
  // visible tab doesn't yank the strip around.
  if (scrollOffset > leftAlignedOffset) return leftAlignedOffset;
  if (scrollOffset < rightAlignedOffset) return rightAlignedOffset;
  return null;
}

/**
 * A horizontally scrolling pill tab strip.
 *
 * Replaces two independent implementations — the Requests tab row and the
 * Schedule focus-area pills — which had drifted apart on border, fill, label
 * token, press feedback and even accessibility role, and neither of which
 * scrolled a selected tab back into view when it sat off the right edge.
 *
 * Unlike `SegmentedControl`, the tab count here varies, the strip scrolls, and
 * tabs can carry a count badge; a sliding-thumb control can represent none of
 * that.
 */
export function ScrollableTabStrip({
  tabs,
  activeKey,
  onSelect,
  accessibilityLabel,
}: {
  tabs: ReadonlyArray<ScrollableTab>;
  /** Null selects nothing — no tab renders active, and no scroll is triggered. */
  activeKey: string | null;
  onSelect: (key: string) => void;
  accessibilityLabel?: string;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  // Measured per tab, because labels differ in width — the same reason the
  // segmented control measures rather than assuming equal fractions.
  const layoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const scrollOffsetRef = useRef(0);

  const scrollTabIntoView = useCallback(
    (key: string) => {
      const layout = layoutsRef.current[key];
      if (!layout) return;

      const offset = getTabScrollIntoViewOffset({
        scrollOffset: scrollOffsetRef.current,
        tab: layout,
        viewportWidth,
      });
      if (offset === null) return;

      scrollRef.current?.scrollTo({ x: offset, animated: true });
    },
    [viewportWidth],
  );

  const handleTabLayout = useCallback(
    (key: string, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      const previous = layoutsRef.current[key];
      layoutsRef.current[key] = { x, width };

      // The effect below runs before native layout lands, so a tab that is
      // already active on first paint — a deep-linked request filter, the
      // schedule's home focus area — has nothing to measure against yet and
      // would stay parked off-screen. Align it as its geometry arrives.
      if (key === activeKey && (previous?.x !== x || previous?.width !== width)) {
        scrollTabIntoView(key);
      }
    },
    [activeKey, scrollTabIntoView],
  );

  useEffect(() => {
    if (activeKey === null) return;
    scrollTabIntoView(activeKey);
  }, [activeKey, scrollTabIntoView]);

  return (
    <ScrollView
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.content}
      horizontal
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      onScroll={(event) => {
        scrollOffsetRef.current = event.nativeEvent.contentOffset.x;
      }}
      ref={scrollRef}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;

        return (
          <Pressable
            key={tab.key}
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            // The badge is a sibling the explicit label hides from assistive
            // tech; the value slot reads the count right after the name.
            accessibilityValue={tab.count ? { text: String(tab.count) } : undefined}
            accessibilityState={{ selected: isActive }}
            android_ripple={{ color: mobileColors.rippleNeutral }}
            // The pill is 36pt tall by design; pad the touch area out to the
            // 44pt minimum without changing how it looks.
            hitSlop={{ bottom: 4, top: 4 }}
            onLayout={(event) => handleTabLayout(tab.key, event)}
            onPress={() => {
              if (tab.key === activeKey) return;
              hapticSelection();
              onSelect(tab.key);
            }}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[styles.label, isActive ? styles.labelActive : styles.labelIdle]}
            >
              {tab.label}
            </Text>
            <NumericBadge count={tab.count ?? 0} tone={isActive ? "onAccent" : "neutral"} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * The strip's stand-in for a screen's loading pass.
 *
 * A strip whose tabs carry counts must not paint before those counts are known.
 * Rendering the real one early looks finished, then every badge pops in when the
 * screen's data lands and shoves each pill along — a second wave, and the thing
 * that reads as the tabs re-rendering themselves. Screens that count something
 * render this while their skeleton is up and the real strip once they have data.
 *
 * Reuses the strip's own style objects rather than restating its numbers, so the
 * pill height and gaps can't drift apart from what replaces them.
 */
export function ScrollableTabStripSkeleton({
  tabs,
  widths = [92, 68, 78, 104],
}: {
  /** How many pills to stand in for. Usually the screen's real tab count. */
  tabs: number;
  /** Cycled through so the row reads as varied labels rather than a bar chart. */
  widths?: readonly number[];
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.strip, styles.content]}>
        {Array.from({ length: tabs }, (_, index) => (
          <SkeletonBlock
            key={index}
            height={SKELETON_TAB_HEIGHT}
            radius={mobileRadii.pill}
            width={widths[index % widths.length]}
          />
        ))}
      </View>
    </View>
  );
}

/** The pill's `minHeight`, which is also its resting height at one line. */
const SKELETON_TAB_HEIGHT = mobileControl.sm;

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // Negative margin so the strip bleeds to the screen edges while its content
    // still starts at the gutter.
    strip: {
      marginHorizontal: -getScreenGutter(),
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      paddingHorizontal: getScreenGutter(),
      paddingVertical: mobileSpace.xs,
    },
    tab: {
      ...mobilePillOverflow.interactiveContainer,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      minHeight: mobileControl.sm,
      maxWidth: 180,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
      borderRadius: mobileRadii.pill,
      // Same hairline the shared SegmentedControl carries: the neutral fill
      // alone sits at 1.22:1 on a white page, so the border is what actually
      // draws an idle tab's edge.
      borderWidth: 1,
      borderColor: mobileColors.controlNeutralBorder,
      backgroundColor: mobileColors.controlNeutralBg,
    },
    tabActive: {
      backgroundColor: mobileColors.brand,
      // The active tab keeps the same 1pt geometry, with the edge folded into
      // its own fill, since a grey hairline on a brand pill reads as an outline.
      borderColor: mobileColors.brand,
    },
    label: {
      ...mobileText.bodyStrong,
      ...mobilePillOverflow.interactiveText,
    },
    labelIdle: {
      color: mobileColors.textSecondary,
    },
    labelActive: {
      color: mobileColors.onBrandText,
    },
  });
