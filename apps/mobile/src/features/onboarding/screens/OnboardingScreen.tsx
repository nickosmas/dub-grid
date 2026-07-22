import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { router } from "expo-router";
import {
  Dimensions,
  Image,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { Button } from "../../../shared/components/Button";
import { DubGridWordmark } from "../../../shared/components/DubGridWordmark";
import { hapticSelection } from "../../../shared/lib/haptics";
import { saveHasSeenOnboarding } from "../../../shared/lib/session";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import type { MobileColors } from "../../../shared/theme/tokens";
import { OnboardingCard } from "../components/OnboardingCard";
import { OnboardingPagination } from "../components/OnboardingPagination";
import { IllustrationNotifications } from "../components/illustrations/IllustrationNotifications";
import { IllustrationSwapPreview } from "../components/illustrations/IllustrationSwapPreview";
import { IllustrationUpcomingShift } from "../components/illustrations/IllustrationUpcomingShift";

const SLIDES: Array<{ visual: ReactNode; title: string; body: string }> = [
  {
    visual: <IllustrationUpcomingShift />,
    title: "Your schedule, always with you",
    body: "See your shifts at a glance, so you always know when and where you're working, and what's coming up next.",
  },
  {
    visual: <IllustrationSwapPreview />,
    title: "Cover shifts on the go",
    body: "Pick up open shifts, swap with teammates, or request time off. With manager approval built in.",
  },
  {
    visual: <IllustrationNotifications />,
    title: "Stay in the loop",
    body: "Get notified instantly when your schedule changes or someone needs you to step in.",
  },
];

const AnimatedScrollView = Animated.ScrollView;

export default function OnboardingScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [pageWidth, setPageWidth] = useState(Dimensions.get("window").width);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const lastIndexRef = useRef(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const nextIndex = Math.round(offsetX / pageWidth);
      if (nextIndex !== lastIndexRef.current) {
        lastIndexRef.current = nextIndex;
        hapticSelection();
      }
      setActiveIndex(nextIndex);
    },
    [pageWidth],
  );

  const completeOnboarding = useCallback(async () => {
    await saveHasSeenOnboarding(true);
    router.replace("/(auth)/login");
  }, []);

  const handleSkip = useCallback(() => {
    void completeOnboarding();
  }, [completeOnboarding]);

  const handlePrimary = useCallback(() => {
    if (activeIndex >= SLIDES.length - 1) {
      void completeOnboarding();
      return;
    }

    scrollRef.current?.scrollTo({
      x: (activeIndex + 1) * pageWidth,
      animated: true,
    });
  }, [activeIndex, completeOnboarding, pageWidth]);

  const isLast = activeIndex >= SLIDES.length - 1;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.brand}>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="DubGrid logo"
            source={require("../../../../assets/images/logo-blue.png")}
            style={styles.brandMark}
          />
          <DubGridWordmark fontSize={20} color={mobileColors.textPrimary} />
        </View>
        <View style={styles.skipButton}>
          <Button label="Skip" onPress={handleSkip} tone="link" />
        </View>
      </View>

      <View
        style={styles.scroller}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0 && width !== pageWidth) {
            setPageWidth(width);
          }
        }}
      >
        <AnimatedScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          onScroll={scrollHandler}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          decelerationRate="fast"
        >
          {SLIDES.map((slide) => (
            <OnboardingCard
              key={slide.title}
              visual={slide.visual}
              title={slide.title}
              body={slide.body}
              width={pageWidth}
            />
          ))}
        </AnimatedScrollView>
      </View>

      <View style={styles.footer}>
        <OnboardingPagination count={SLIDES.length} pageWidth={pageWidth} scrollX={scrollX} />
        <Button label={isLast ? "Get Started" : "Continue"} onPress={handlePrimary} />
      </View>
    </SafeAreaView>
  );
}

const createStyles = (mobileColors: MobileColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: mobileColors.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandMark: {
    width: 24,
    height: 24,
  },
  skipButton: {
    minWidth: 64,
    alignItems: "flex-end",
  },
  scroller: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 24,
    alignItems: "stretch",
  },
});
