import { useState, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";

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
  const scale =
    availableHeight != null && contentHeight != null && contentHeight > 0
      ? Math.min(1, availableHeight / contentHeight)
      : 1;

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
  stage: {
    flex: 1,
    alignSelf: "center",
    overflow: "hidden",
  },
  scroller: {
    flex: 1,
  },
  content: {
    transformOrigin: "top center",
  },
  unmeasured: {
    opacity: 0,
  },
});
