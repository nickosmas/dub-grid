import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Platform,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileSpacing, mobileText, type MobileColors } from "../theme/tokens";

export type CardIconTone = "brand" | "warning" | "danger" | "success";

function createCardIconTone(
  mobileColors: MobileColors,
): Record<CardIconTone, { backgroundColor: string; borderColor: string; iconColor: string }> {
  return {
    brand: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      iconColor: mobileColors.brand,
    },
    warning: {
      backgroundColor: mobileColors.warningSoft,
      borderColor: mobileColors.warningBorder,
      iconColor: mobileColors.warningText,
    },
    danger: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
      iconColor: mobileColors.dangerText,
    },
    success: {
      backgroundColor: mobileColors.successSoft,
      borderColor: mobileColors.successBorder,
      iconColor: mobileColors.successText,
    },
  };
}
import {
  DEFAULT_SCREEN_BOTTOM_PADDING_MODE,
  getScreenBottomPadding,
  type ScreenBottomPaddingMode,
} from "./screen-layout";

export type ScreenScrollHandle = ScrollView;
export type { ScreenBottomPaddingMode } from "./screen-layout";
type ScreenScrollViewProps = ComponentProps<typeof ScrollView>;

export function Screen({
  title: _title,
  subtitle: _subtitle,
  stickyHeader,
  stickyHeaderShellStyle,
  stickyHeaderTopPadding,
  renderOverlay,
  scrollViewRef,
  children,
  refreshing = false,
  onRefresh,
  onScroll,
  scrollEventThrottle,
  bottomPaddingMode = DEFAULT_SCREEN_BOTTOM_PADDING_MODE,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  stickyHeader?: ReactNode;
  stickyHeaderShellStyle?: StyleProp<ViewStyle>;
  stickyHeaderTopPadding?: number;
  renderOverlay?: (options: { stickyHeaderHeight: number }) => ReactNode;
  scrollViewRef?: RefObject<ScreenScrollHandle | null>;
  refreshing?: boolean;
  onRefresh?: () => void;
  onScroll?: ScreenScrollViewProps["onScroll"];
  scrollEventThrottle?: number;
  bottomPaddingMode?: ScreenBottomPaddingMode;
}>) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const insets = useSafeAreaInsets();
  const internalScrollViewRef = useRef<ScrollView>(null);
  // Mirrors stickyHeaderHeight so the translating scroll handle below can
  // always read the *current* height at call time, not whatever it was
  // when the handle was created.
  const stickyHeaderHeightRef = useRef(0);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const overlay = renderOverlay?.({ stickyHeaderHeight });
  const useNativeContentInsets = !stickyHeader;
  const shouldExposeNativeScrollRoot = !stickyHeader && !renderOverlay;
  const resolvedStickyHeaderTopPadding = stickyHeaderTopPadding ?? Math.max(insets.top, 8);
  // Android's RefreshControl has progressViewOffset to push the pull-to-
  // refresh spinner below the floating sticky header; iOS has no such prop.
  // A JS-level paddingTop doesn't move the ScrollView's own frame origin
  // (what the native pull reveal is anchored to), so without this the
  // spinner renders directly behind the header instead of below it. Using a
  // native contentInset/contentOffset moves that origin for real.
  const isIosStickyHeader = Platform.OS === "ios" && Boolean(stickyHeader);
  const iosContentInset = useMemo(
    () =>
      isIosStickyHeader ? { top: stickyHeaderHeight, left: 0, bottom: 0, right: 0 } : undefined,
    [isIosStickyHeader, stickyHeaderHeight],
  );
  const iosContentOffset = useMemo(
    () => (isIosStickyHeader ? { x: 0, y: -stickyHeaderHeight } : undefined),
    [isIosStickyHeader, stickyHeaderHeight],
  );
  // `scrollViewRef` hands callers a *logical* content coordinate space —
  // y: 0 always means "the true top of my content" — rather than the raw
  // native ScrollView's contentOffset space. On iOS the floating sticky
  // header is implemented via contentInset (not padding), so native y: 0
  // actually sits behind the header, not below it; on Android the header's
  // height is already baked into contentContainerStyle's paddingTop, so
  // native y: 0 is already correct there. Without this translation, any
  // caller scrolling "to the top" (e.g. ScheduleScreen resetting scroll
  // position when the visible date range changes) would land content under
  // the header on iOS specifically.
  const scrollHandle = useMemo<ScreenScrollHandle>(
    () =>
      ({
        scrollTo: (options?: { x?: number; y?: number; animated?: boolean } | number) => {
          const target = typeof options === "number" ? { y: options } : (options ?? {});
          const y =
            isIosStickyHeader && typeof target.y === "number"
              ? target.y - stickyHeaderHeightRef.current
              : target.y;
          internalScrollViewRef.current?.scrollTo({ ...target, y });
        },
      }) as unknown as ScreenScrollHandle,
    [isIosStickyHeader],
  );
  useEffect(() => {
    if (scrollViewRef) {
      (scrollViewRef as MutableRefObject<ScreenScrollHandle | null>).current = scrollHandle;
    }
  }, [scrollViewRef, scrollHandle]);
  const scrollView = (
    <ScrollView
      ref={internalScrollViewRef}
      automaticallyAdjustContentInsets={useNativeContentInsets}
      automaticallyAdjustsScrollIndicatorInsets={useNativeContentInsets}
      contentContainerStyle={{
        paddingTop: stickyHeader ? (isIosStickyHeader ? 0 : stickyHeaderHeight) : 0,
        paddingBottom: getScreenBottomPadding(bottomPaddingMode, insets.bottom),
      }}
      contentInset={iosContentInset}
      contentOffset={iosContentOffset}
      contentInsetAdjustmentBehavior={useNativeContentInsets ? "automatic" : "never"}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={stickyHeader ? stickyHeaderHeight : 0}
            tintColor={mobileColors.brand}
            colors={[mobileColors.brand]}
          />
        ) : undefined
      }
      scrollEventThrottle={scrollEventThrottle}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
    >
      <View
        style={[
          styles.content,
          stickyHeader ? styles.contentWithStickyHeader : styles.contentDefault,
        ]}
      >
        {children}
      </View>
    </ScrollView>
  );
  const overlayLayer = (
    <View pointerEvents="box-none" style={styles.overlayLayer}>
      {overlay}
    </View>
  );

  if (shouldExposeNativeScrollRoot) {
    return scrollView;
  }

  return (
    <View style={styles.root}>
      {stickyHeader ? (
        <View
          style={[
            styles.stickyHeaderShell,
            stickyHeaderShellStyle,
            { paddingTop: resolvedStickyHeaderTopPadding },
          ]}
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;

            if (nextHeight !== stickyHeaderHeight) {
              // The header's height is unknown (0) until this very first
              // measurement lands. If a caller scrolled "to the top" via
              // scrollViewRef before this fires (e.g. on a warm cache, where
              // data — and so that scroll — can resolve in the same tick as
              // mount, ahead of this native layout callback), the translation
              // above had nothing to subtract yet and was a no-op, leaving
              // content sitting under the header with no visible correction.
              // Self-correct once, right here, the moment the real height is
              // known, regardless of what any caller already tried.
              if (isIosStickyHeader && stickyHeaderHeight === 0) {
                internalScrollViewRef.current?.scrollTo({ x: 0, y: -nextHeight, animated: false });
              }
              stickyHeaderHeightRef.current = nextHeight;
              setStickyHeaderHeight(nextHeight);
            }
          }}
        >
          {stickyHeader}
        </View>
      ) : null}
      {scrollView}
      {overlay == null ? null : overlayLayer}
    </View>
  );
}

export function Card({
  title,
  body,
  detail,
  headerAccessory,
  icon,
  iconTone = "brand",
}: {
  title: string;
  body?: string;
  detail?: ReactNode;
  headerAccessory?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: CardIconTone;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const cardIconTone = useMemo(() => createCardIconTone(mobileColors), [mobileColors]);
  const tone = cardIconTone[iconTone];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {icon ? (
          <View
            style={[
              styles.cardIconFrame,
              { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
            ]}
          >
            <Ionicons color={tone.iconColor} name={icon} size={16} />
          </View>
        ) : null}
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {headerAccessory ? <View style={styles.cardHeaderAccessory}>{headerAccessory}</View> : null}
      </View>
      {body ? <Text style={styles.cardBody}>{body}</Text> : null}
      {detail}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    scrollView: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    content: {
      paddingHorizontal: mobileSpacing.screenX,
      gap: mobileSpacing.sectionGap,
    },
    contentDefault: {
      paddingTop: 0,
    },
    contentWithStickyHeader: {
      paddingTop: mobileSpacing.sectionGap,
    },
    stickyHeaderShell: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      backgroundColor: mobileColors.background,
      paddingHorizontal: mobileSpacing.screenX,
      paddingTop: 4,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: mobileColors.borderSubtle,
      elevation: 4,
    },
    overlayLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      elevation: 20,
    },
    card: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      padding: 18,
      gap: 10,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      shadowColor: mobileColors.shadowStrong,
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: 1,
      shadowRadius: 20,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    cardHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    cardHeaderAccessory: {
      alignSelf: "flex-start",
    },
    cardIconFrame: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    cardTitle: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    cardBody: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
  });
