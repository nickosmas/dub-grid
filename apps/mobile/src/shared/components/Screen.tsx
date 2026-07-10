import {
  useState,
  type ComponentProps,
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
import { mobileColors, mobileRadii, mobileSpacing, mobileText } from "../theme/tokens";

export type CardIconTone = "brand" | "warning" | "danger" | "success";

const CARD_ICON_TONE: Record<
  CardIconTone,
  { backgroundColor: string; borderColor: string; iconColor: string }
> = {
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
  const insets = useSafeAreaInsets();
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const overlay = renderOverlay?.({ stickyHeaderHeight });
  const useNativeContentInsets = !stickyHeader;
  const shouldExposeNativeScrollRoot = !stickyHeader && !renderOverlay;
  const resolvedStickyHeaderTopPadding = stickyHeaderTopPadding ?? Math.max(insets.top, 8);
  const scrollView = (
    <ScrollView
      ref={scrollViewRef}
      automaticallyAdjustContentInsets={useNativeContentInsets}
      automaticallyAdjustsScrollIndicatorInsets={useNativeContentInsets}
      contentContainerStyle={{
        paddingTop: stickyHeader ? stickyHeaderHeight : 0,
        paddingBottom: getScreenBottomPadding(bottomPaddingMode, insets.bottom),
      }}
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
  const tone = CARD_ICON_TONE[iconTone];

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

const styles = StyleSheet.create({
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
