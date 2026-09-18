import { useMemo, useRef, type MutableRefObject } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import type { MobileNotification } from "@dubgrid/contracts";
import { Pressable } from "../../../shared/components/Pressable";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileListRow,
  mobileSpace,
  mobileTabularText,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { getScreenGutter } from "../../../shared/components/screen-layout";
import { formatRelativeTime } from "../../dashboard/components/ActivityFeedCard";

/** Width of one revealed swipe action. */
const SWIPE_ACTION_WIDTH = 88;

/**
 * The one row whose actions are showing. A list shares a single ref so that
 * opening a second row closes the first: two open reveals read as a broken
 * list, and iOS Mail never allows it either.
 */
export type OpenSwipeRegistry = MutableRefObject<SwipeableMethods | null>;

/**
 * One alert as a mailbox item: an unread dot, the title with its time on the
 * same line, two lines of the message, a hairline below. The actions live
 * behind a left swipe (read or unread, archive or restore) rather than as
 * buttons on a card, so a list of alerts is a column of rows and not a stack
 * of panels. Tapping the row opens the alert; the caller marks it read first.
 */
export function NotificationRow({
  notification,
  pending,
  openRegistry,
  onPress,
  onToggleRead,
  onArchive,
}: {
  notification: MobileNotification;
  pending: boolean;
  openRegistry?: OpenSwipeRegistry;
  onPress: () => void;
  onToggleRead: () => void;
  onArchive: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const swipeable = useRef<SwipeableMethods>(null);
  const isUnread = !notification.readAt;
  const isArchived = !!notification.archivedAt;
  const isUrgent = notification.priority === "critical" || notification.priority === "high";
  const groupCount =
    typeof notification.metadata?.groupCount === "number" ? notification.metadata.groupCount : 0;

  // Close the reveal before acting: the row is about to change under it, and
  // an open swipe over a refetched list reads as a stuck gesture.
  const runAction = (action: () => void) => {
    swipeable.current?.close();
    action();
  };
  const handleWillOpen = () => {
    if (!openRegistry) return;
    if (openRegistry.current && openRegistry.current !== swipeable.current) {
      openRegistry.current.close();
    }
    openRegistry.current = swipeable.current;
  };
  const handleClose = () => {
    if (openRegistry && openRegistry.current === swipeable.current) {
      openRegistry.current = null;
    }
  };

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      onSwipeableClose={handleClose}
      onSwipeableWillOpen={handleWillOpen}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={isUnread ? "Mark as read" : "Mark as unread"}
            accessibilityRole="button"
            onPress={() => runAction(onToggleRead)}
            style={[styles.action, styles.actionRead]}
          >
            <Ionicons
              color={mobileColors.onBrandText}
              name={isUnread ? "mail-open-outline" : "mail-unread-outline"}
              size={20}
            />
            <Text style={[styles.actionLabel, { color: mobileColors.onBrandText }]}>
              {isUnread ? "Read" : "Unread"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={isArchived ? "Restore from archive" : "Archive"}
            accessibilityRole="button"
            onPress={() => runAction(onArchive)}
            style={[styles.action, styles.actionArchive]}
          >
            <Ionicons
              color={mobileColors.textPrimary}
              name={isArchived ? "arrow-undo-outline" : "archive-outline"}
              size={20}
            />
            <Text style={[styles.actionLabel, { color: mobileColors.textPrimary }]}>
              {isArchived ? "Restore" : "Archive"}
            </Text>
          </Pressable>
        </View>
      )}
      rightThreshold={SWIPE_ACTION_WIDTH / 2}
    >
      <PressableRow
        accessibilityLabel={`${isUnread ? "Unread: " : ""}${notification.title}`}
        onPress={onPress}
        style={[styles.row, isUnread ? styles.rowUnread : null]}
      >
        <View style={styles.leading}>
          {pending ? (
            <ActivityIndicator color={mobileColors.brand} size="small" />
          ) : isUnread ? (
            <View style={styles.unreadDot} />
          ) : null}
        </View>
        <View style={styles.copy}>
          <View style={styles.titleLine}>
            {isUrgent ? (
              <Ionicons
                color={
                  notification.priority === "critical"
                    ? mobileColors.dangerText
                    : mobileColors.warningText
                }
                name="alert-circle"
                size={16}
              />
            ) : null}
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              numberOfLines={1}
              style={[styles.title, isUnread ? styles.titleUnread : null]}
            >
              {notification.title}
              {groupCount > 1 ? <Text style={styles.groupCount}> ×{groupCount}</Text> : null}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.time}>
              {formatRelativeTime(notification.createdAt)}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2} style={styles.message}>
            {notification.message}
          </Text>
        </View>
      </PressableRow>
    </ReanimatedSwipeable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // The list bleeds to the screen edges (see the screen's `list` style) so
    // a swiped row's actions meet the edge; the row keeps the gutter as its
    // own padding so its text still lines up with the page.
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.sm,
      paddingVertical: mobileListRow.paddingVertical,
      paddingHorizontal: getScreenGutter(),
      backgroundColor: mobileColors.background,
    },
    // The same tint web gives an unread row (brandSoft matches --dg-color-info-bg).
    rowUnread: {
      backgroundColor: mobileColors.brandSoft,
    },
    // A fixed column so read and unread titles line up; the dot sits on the
    // title's first line rather than centred on a two-line row.
    leading: {
      width: mobileSpace.lg,
      alignItems: "center",
      paddingTop: (mobileText.body.lineHeight - mobileSpace.sm) / 2,
    },
    unreadDot: {
      width: mobileSpace.sm,
      height: mobileSpace.sm,
      borderRadius: mobileSpace.xs,
      backgroundColor: mobileColors.brand,
    },
    copy: {
      flex: 1,
      gap: mobileListRow.titleGap,
    },
    titleLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    title: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
      flex: 1,
    },
    titleUnread: {
      ...mobileTextWeighted("body", "semibold"),
    },
    groupCount: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
    time: {
      ...mobileText.caption,
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    message: {
      ...mobileText.meta,
      color: mobileColors.textSecondary,
    },
    // The gap between the row's text and the first action is the page
    // showing through, so the actions read as a control beside the row
    // rather than as the row's own edge.
    actions: {
      flexDirection: "row",
      marginLeft: mobileSpace.md,
    },
    action: {
      width: SWIPE_ACTION_WIDTH,
      alignItems: "center",
      justifyContent: "center",
      gap: mobileSpace.xs,
    },
    actionRead: {
      backgroundColor: mobileColors.brand,
    },
    actionArchive: {
      backgroundColor: mobileColors.controlNeutralBg,
    },
    actionLabel: {
      ...mobileText.label,
    },
  });
