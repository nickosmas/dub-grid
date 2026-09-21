import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { GradientBackdrop } from "../../../shared/components/GradientBackdrop";
import { hapticSelection } from "../../../shared/lib/haptics";
import { markHasSeenOnboarding } from "../../auth/hooks/useHasSeenOnboarding";
import {
  getPushPermissionState,
  requestPushPermission,
  type PushPermissionState,
} from "../../notifications/lib/push-permission";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileControl, mobileSpace, type MobileColors } from "../../../shared/theme/tokens";
import { NotificationReasons } from "../components/NotificationReasons";
import { OnboardingCard } from "../components/OnboardingCard";
import { OnboardingPagination } from "../components/OnboardingPagination";
import { CoverShiftsPreview } from "../components/previews/CoverShiftsPreview";
import { UpcomingShiftPreview } from "../components/previews/UpcomingShiftPreview";

const SLIDES: Array<{ visual: ReactNode; title: string; body: string }> = [
  {
    visual: <UpcomingShiftPreview />,
    title: "Your schedule, always with you",
    body: "See your shifts at a glance, so you always know when and where you're working, and what's coming up next.",
  },
  {
    visual: <CoverShiftsPreview />,
    title: "Cover shifts on the go",
    body: "Pick up open shifts, swap with teammates, or request time off. With manager approval built in.",
  },
  // The permission step. It says what the OS prompt is for before the prompt
  // appears, so the reasons card stands where the other slides have a mock-up.
  {
    visual: <NotificationReasons />,
    title: "Know when things change",
    body: "Shifts move and requests get answered while you're away. Notifications tell you in time, and you choose which kinds in Profile.",
  },
];

const AnimatedScrollView = Animated.ScrollView;

export default function OnboardingScreen() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [pageWidth, setPageWidth] = useState(Dimensions.get("window").width);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pushPermission, setPushPermission] = useState<PushPermissionState | null>(null);
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const lastIndexRef = useRef(0);

  // Resolved under the startup splash, which stays up for the tour's first
  // frames, so the footer is already in its final shape when it appears.
  useEffect(() => {
    let cancelled = false;
    void getPushPermissionState().then(
      (state) => {
        if (!cancelled) setPushPermission(state);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

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
    await markHasSeenOnboarding(true);
    router.replace("/(auth)/login");
  }, []);

  const handleSkip = useCallback(() => {
    void completeOnboarding();
  }, [completeOnboarding]);

  const handleAdvance = useCallback(() => {
    scrollRef.current?.scrollTo({
      x: (activeIndex + 1) * pageWidth,
      animated: true,
    });
  }, [activeIndex, pageWidth]);

  const handleEnableNotifications = useCallback(async () => {
    try {
      await requestPushPermission();
    } catch {
      // A prompt that fails is no reason to hold the user on the tour; the
      // switch in Profile > Notifications asks again.
    }
    await completeOnboarding();
  }, [completeOnboarding]);

  const isLast = activeIndex >= SLIDES.length - 1;
  // Only a device that has not answered yet gets the ask: the OS shows its
  // prompt once, so on a decided device the button would do nothing.
  const canAskForNotifications = pushPermission === "undetermined";
  const asksForNotifications = isLast && canAskForNotifications;

  return (
    <View style={styles.root}>
      {/* A brand halo behind the header, fading out before the copy starts.
          Outside the safe area on purpose: it is `position: absolute; top: 0`,
          and Yoga positions an absolute child from its parent's *padding* edge,
          so inside the SafeAreaView it started below the notch and left a flat
          band of background across the status bar. */}
      <GradientBackdrop height="100%" kind="aurora" />
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
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
            testID="onboarding-pager"
          >
            {SLIDES.map((slide, index) => (
              <OnboardingCard
                key={slide.title}
                visual={slide.visual}
                title={slide.title}
                body={slide.body}
                width={pageWidth}
                index={index}
                scrollX={scrollX}
              />
            ))}
          </AnimatedScrollView>
        </View>

        <View style={styles.footer}>
          <OnboardingPagination count={SLIDES.length} pageWidth={pageWidth} scrollX={scrollX} />
          <View style={styles.actions}>
            {asksForNotifications ? (
              <Button label="Enable notifications" onPress={handleEnableNotifications} />
            ) : (
              <Button
                label={isLast ? "Get started" : "Continue"}
                onPress={isLast ? handleSkip : handleAdvance}
              />
            )}
            {/* Reserved on every slide once the ask is possible, so the dots
                and the button don't jump up when the last slide arrives. */}
            {canAskForNotifications ? (
              <View style={styles.secondarySlot}>
                {asksForNotifications ? (
                  <Button label="Not now" onPress={handleSkip} tone="link" />
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    safeArea: {
      flex: 1,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      // Matches the footer/slide gutter so the logo shares their left edge.
      paddingHorizontal: 24,
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
    // Primary over a text link, spaced like the sign-in screen's action group.
    actions: {
      gap: mobileSpace.sm,
    },
    secondarySlot: {
      minHeight: mobileControl.md,
      justifyContent: "center",
    },
  });
