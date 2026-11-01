import { useMemo, useRef, type MutableRefObject } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import type { MobileNotification } from "@dubgrid/contracts";
import { formatNotificationMetadata } from "@dubgrid/domain";
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

/** Width of one revealed swipe action: a full-height panel, as in iOS Mail. */
const SWIPE_ACTION_WIDTH = 76;

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
 * of panels. As in iOS Mail, each action is a full-height coloured panel with
 * its symbol over its label, uncovered as the row slides off the edge.
 * Tapping the row opens the alert; the caller marks it read as it goes.
 */
export function NotificationRow({
  notification,
  openRegistry,
  onPress,
  onToggleRead,
  onArchive,
}: {
  notification: MobileNotification;
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
  // The rare human note (a request's reason, a reviewer's note) reads under
  // the message; the mobile app has no platform surfaces, so org audience.
  const notes = formatNotificationMetadata(notification.metadata, { audience: "org" });

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
        <SwipeActions
          styles={styles}
          mobileColors={mobileColors}
          isUnread={isUnread}
          isArchived={isArchived}
          onToggleRead={() => runAction(onToggleRead)}
          onArchive={() => runAction(onArchive)}
        />
      )}
      rightThreshold={SWIPE_ACTION_WIDTH / 2}
    >
      <View style={styles.card}>
        <PressableRow
          accessibilityLabel={`${isUnread ? "Unread: " : ""}${notification.title}`}
          onPress={onPress}
          style={styles.row}
        >
          <View style={styles.leading}>{isUnread ? <View style={styles.unreadDot} /> : null}</View>
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
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.message}>
              {notification.message}
            </Text>
            {notes.map((note) => (
              <Text key={note.label} maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.note}>
                <Text style={styles.noteLabel}>{note.label}: </Text>
                {note.value}
              </Text>
            ))}
          </View>
        </PressableRow>
      </View>
    </ReanimatedSwipeable>
  );
}

type RowStyles = ReturnType<typeof createStyles>;

function SwipeActions({
  styles,
  mobileColors,
  isUnread,
  isArchived,
  onToggleRead,
  onArchive,
}: {
  styles: RowStyles;
  mobileColors: MobileColors;
  isUnread: boolean;
  isArchived: boolean;
  onToggleRead: () => void;
  onArchive: () => void;
}) {
  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityLabel={isUnread ? "Mark as read" : "Mark as unread"}
        accessibilityRole="button"
        onPress={onToggleRead}
        style={[styles.action, styles.actionRead]}
      >
        <Ionicons
          color={mobileColors.textInverse}
          name={isUnread ? "mail-open" : "mail-unread"}
          size={22}
        />
        <Text fit="fixed" style={[styles.actionLabel, styles.actionLabelOnFill]}>
          {isUnread ? "Read" : "Unread"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={isArchived ? "Restore from archive" : "Archive"}
        accessibilityRole="button"
        onPress={onArchive}
        style={[styles.action, styles.actionArchive]}
      >
        <Ionicons
          color={mobileColors.textPrimary}
          name={isArchived ? "arrow-undo" : "archive"}
          size={22}
        />
        <Text fit="fixed" style={styles.actionLabel}>
          {isArchived ? "Restore" : "Archive"}
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // The list bleeds to the screen edges (see the screen's `list` style) so
    // a swiped row's actions meet the edge; the row keeps the gutter as its
    // own padding so its text still lines up with the page.
    card: {
      overflow: "hidden",
      backgroundColor: mobileColors.background,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: mobileSpace.sm,
      paddingVertical: mobileListRow.paddingVertical,
      paddingHorizontal: getScreenGutter(),
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
    // Title over content: a semibold row title, the message a step down in
    // size and color, the time a step further. Unread only adds weight.
    title: {
      ...mobileTextWeighted("rowTitle", "semibold"),
      color: mobileColors.textPrimary,
      flex: 1,
    },
    titleUnread: {
      ...mobileTextWeighted("rowTitle", "bold"),
    },
    groupCount: {
      ...mobileText.meta,
      color: mobileColors.textMuted,
    },
    time: {
      ...mobileText.meta,
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    message: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    note: {
      ...mobileText.meta,
      color: mobileColors.textSecondary,
    },
    noteLabel: {
      color: mobileColors.textMuted,
    },
    actions: {
      flexDirection: "row",
      alignItems: "stretch",
    },
    action: {
      width: SWIPE_ACTION_WIDTH,
      alignItems: "center",
      justifyContent: "center",
      gap: mobileSpace.xs,
    },
    actionRead: {
      backgroundColor: mobileColors.buttonPrimaryBg,
    },
    actionArchive: {
      backgroundColor: mobileColors.controlNeutralBg,
    },
    actionLabel: {
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.textPrimary,
    },
    actionLabelOnFill: {
      color: mobileColors.textInverse,
    },
  });
