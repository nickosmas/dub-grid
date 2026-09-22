import { useState, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { mobileSpace } from "../../../../shared/theme/tokens";

// How far a card's shadow reaches past it. iOS blurs a shadow to about twice
// its radius, so the hero card (28pt radius, 14pt down) still shows some
// 40pt above itself and the open-shift card (12pt, 4pt down) some 20pt. The
// scroll view clips to its frame whatever `overflow` says, so the frame is
// grown by this much above and the content padded by it on both ends, and
// the shadow lands inside the frame instead of ending on a hard line.
export const SHADOW_BLEED = mobileSpace["5xl"];

/**
 * How far the stage shrinks its content: not at all while the card and its
 * shadow fit, otherwise just enough that they do. Unmeasured is treated as
 * fitting, so a stage never scales on a guess.
 */
export function getPreviewStageScale(
  availableHeight: number | null,
  contentHeight: number | null,
): number {
  if (availableHeight == null || contentHeight == null || contentHeight <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, availableHeight - SHADOW_BLEED) / contentHeight);
}

/**
 * The slide's own screen, live: the children are the real components of the
 * screen the slide is about, laid out at the device's width with the app's
 * own gutter, at their real size. Only when the slide is too short for them,
 * as on a small phone, is the whole stage scaled down from its top edge so
 * the view is never cut off mid-card. No bezel, status bar or island: a
 * phone drawn inside the phone read as a screenshot.
 *
 * Nothing here is pressable or announced: the stage sits inside the
 * onboarding pager, and the slide's own title and body carry the meaning.
 */
export function OnboardingPreviewStage({ children }: { children: ReactNode }) {
  const { width: windowWidth } = useWindowDimensions();
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const scale = getPreviewStageScale(availableHeight, contentHeight);

  const handleStageLayout = (event: LayoutChangeEvent) => {
    setAvailableHeight(event.nativeEvent.layout.height);
  };
  const handleContentLayout = (event: LayoutChangeEvent) => {
    setContentHeight(event.nativeEvent.layout.height);
  };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      onLayout={handleStageLayout}
      // Wider than the copy's measure on purpose: the view spans the screen
      // as it does in the app, so `alignSelf: center` lets it overflow the
      // slide's padding evenly on both sides.
      style={[styles.stage, { width: windowWidth }]}
    >
      {/* A scroll view like the real screens', not a plain column: a column
          of bounded height is measured "at most", which collapses a
          flex-basis-0 text such as the open-shift title. */}
      <ScrollView
        contentContainerStyle={styles.scrollerContent}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        style={styles.scroller}
      >
        <View
          onLayout={handleContentLayout}
          style={[
            styles.content,
            // Hidden until measured, so a stage that has to shrink never
            // paints one frame at full size first.
            availableHeight == null || contentHeight == null ? styles.unmeasured : null,
            { transform: [{ scale }] },
          ]}
        >
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // No clip of its own: the page clips at the screen's edge, and a clip
  // here would cut the card's shadow flat at the stage's top.
  stage: {
    flex: 1,
    alignSelf: "center",
  },
  scroller: {
    flex: 1,
    marginTop: -SHADOW_BLEED,
  },
  scrollerContent: {
    paddingVertical: SHADOW_BLEED,
  },
  content: {
    transformOrigin: "top center",
  },
  unmeasured: {
    opacity: 0,
  },
});
