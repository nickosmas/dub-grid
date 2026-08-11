import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { hapticSelection } from "../lib/haptics";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
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

/** Breathing room left beside the active tab when it is scrolled into view. */
const SCROLL_INTO_VIEW_GUTTER = mobileSpacing.screenX;

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

  const handleTabLayout = useCallback((key: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    layoutsRef.current[key] = { x, width };
  }, []);

  useEffect(() => {
    if (activeKey === null) return;
    const layout = layoutsRef.current[activeKey];
    if (!layout || viewportWidth === 0) return;

    const leftEdge = layout.x - SCROLL_INTO_VIEW_GUTTER;
    const rightOverflow = layout.x + layout.width + SCROLL_INTO_VIEW_GUTTER - viewportWidth;

    // Only scroll when the tab is actually clipped, so selecting an already
    // visible tab doesn't yank the strip around.
    if (rightOverflow > 0) {
      scrollRef.current?.scrollTo({ x: rightOverflow, animated: true });
    } else if (leftEdge < 0) {
      scrollRef.current?.scrollTo({
        x: Math.max(layout.x - SCROLL_INTO_VIEW_GUTTER, 0),
        animated: true,
      });
    }
  }, [activeKey, viewportWidth]);

  return (
    <ScrollView
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.content}
      horizontal
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      ref={scrollRef}
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
              numberOfLines={1}
              style={[styles.label, isActive ? styles.labelActive : styles.labelIdle]}
            >
              {tab.label}
            </Text>
            {tab.count !== undefined && tab.count > 0 ? (
              <View style={[styles.badge, isActive && styles.badgeActive]}>
                <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // Negative margin so the strip bleeds to the screen edges while its content
    // still starts at the gutter.
    strip: {
      marginHorizontal: -mobileSpacing.screenX,
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      paddingHorizontal: mobileSpacing.screenX,
      paddingVertical: 2,
    },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      minHeight: 36,
      maxWidth: 180,
      paddingHorizontal: 14,
      paddingVertical: mobileSpace.sm,
      borderRadius: mobileRadii.pill,
      borderWidth: 0,
      backgroundColor: mobileColors.controlNeutralBg,
    },
    tabActive: {
      backgroundColor: mobileColors.brand,
    },
    label: {
      ...mobileText.bodyStrong,
      flexShrink: 1,
    },
    labelIdle: {
      color: mobileColors.textSecondary,
    },
    labelActive: {
      color: mobileColors.onBrandText,
    },
    badge: {
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.surface,
    },
    badgeActive: {
      backgroundColor: "rgba(255, 255, 255, 0.22)",
    },
    badgeText: {
      ...mobileText.badge,
      color: mobileColors.textMuted,
      textAlign: "center",
      includeFontPadding: false,
    },
    badgeTextActive: {
      color: mobileColors.textInverse,
    },
  });
