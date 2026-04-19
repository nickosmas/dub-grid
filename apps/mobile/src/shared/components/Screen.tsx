import {
  useState,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  mobileColors,
  mobileRadii,
  mobileSpacing,
} from "../theme/tokens";

export type ScreenScrollHandle = ScrollView;

export function Screen({
  title: _title,
  subtitle: _subtitle,
  stickyHeader,
  renderOverlay,
  scrollViewRef,
  children,
  refreshing = false,
  onRefresh,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  stickyHeader?: ReactNode;
  renderOverlay?: (options: { stickyHeaderHeight: number }) => ReactNode;
  scrollViewRef?: RefObject<ScreenScrollHandle | null>;
  refreshing?: boolean;
  onRefresh?: () => void;
}>) {
  const insets = useSafeAreaInsets();
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const overlay = renderOverlay?.({ stickyHeaderHeight });

  return (
    <View style={styles.root}>
      {stickyHeader ? (
        <View
          style={[
            styles.stickyHeaderShell,
            { paddingTop: Math.max(insets.top, 8) },
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
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{
          paddingTop: stickyHeader ? stickyHeaderHeight : 0,
          paddingBottom: Math.max(insets.bottom, 16) + 20,
        }}
        contentInsetAdjustmentBehavior={stickyHeader ? "never" : "automatic"}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressViewOffset={stickyHeader ? stickyHeaderHeight : 0}
            />
          ) : undefined
        }
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
      {overlay ? <View style={styles.overlayLayer}>{overlay}</View> : null}
    </View>
  );
}

export function Card({
  title,
  body,
  detail,
}: {
  title: string;
  body?: string;
  detail?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
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
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: mobileColors.textPrimary,
  },
  cardBody: {
    fontSize: 14,
    color: mobileColors.textMuted,
    lineHeight: 21,
  },
});
