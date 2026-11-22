import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import {
  buildUpcomingMeScheduleItems,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryEndTime,
  getScheduleEntryStartTime,
  isDeletedScheduleHistory,
  type MeScheduleSegmentItem,
} from "@dubgrid/schedule-core";
import { getAvatarTone } from "@dubgrid/design-tokens";
import { Screen } from "../../../shared/components/Screen";
import { Text } from "../../../shared/components/Text";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import {
  getMeHeroShiftmates,
  getScheduleEntrySegmentChange,
  getScheduleItemTypeChip,
} from "../lib/scheduleScreenChips";
import {
  getHeroTiming,
  getSegmentEndTime,
  getSegmentStartTime,
} from "../lib/scheduleScreenHelpers";
import { formatSplitDayTitle } from "../lib/week-range-label";
import { JobPill, MeHeroCard, getInitials } from "./MyScheduleSections";

type HeroStatus = "active" | "upcoming" | "scheduled" | "away";

/**
 * The day beside Home's week on an open iPhone Duo. A day you work shows each
 * shift as Home's own shift card, which carries its date and who works with
 * you; a day off is named, says Unscheduled, and lists who works it.
 */
export function HomeDayPane({
  date,
  todayDate,
  currentTime,
  entries,
  teamEntries,
  onOpenEntry,
}: {
  date: string;
  todayDate: string;
  /** "HH:MM" in the organization's zone, for today's progress. */
  currentTime: string;
  /** The viewer's own week. */
  entries: readonly MobileScheduleEntry[];
  /** The team's week, for who works beside them. */
  teamEntries: MobileScheduleEntry[];
  onOpenEntry: (entry: MobileScheduleEntry) => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  const items = useMemo(
    () =>
      buildUpcomingMeScheduleItems({ entries, featuredItem: null, selectedDate: date }).filter(
        (item) =>
          item.date === date &&
          !isDeletedScheduleHistory(item.entry) &&
          getScheduleEntrySegmentChange(item.entry, item.segment)?.kind !== "deleted",
      ),
    [entries, date],
  );
  const offDayPeople = useMemo(
    () => (items.length > 0 ? [] : workingThatDay(teamEntries, date, entries[0]?.employeeId)),
    [items.length, teamEntries, date, entries],
  );

  if (items.length > 0) {
    return (
      <Screen bottomPaddingMode="tabbed">
        <View style={styles.cards}>
          {items.map((item) => {
            const status = heroStatus(item, todayDate, currentTime);
            const shiftmates = getMeHeroShiftmates(item, teamEntries);
            return (
              <View key={item.key} style={styles.shift}>
                <MeHeroCard
                  currentDate={todayDate}
                  currentTime={currentTime}
                  featuredItem={item}
                  shiftmates={NO_SHIFTMATES}
                  status={status}
                  timing={getHeroTiming(
                    item.entry,
                    getSegmentStartTime(item.segment) ?? getScheduleEntryStartTime(item.entry),
                    getSegmentEndTime(item.segment) ?? getScheduleEntryEndTime(item.entry),
                    status,
                    todayDate,
                    currentTime,
                  )}
                  onPress={() => onOpenEntry(item.entry)}
                />
                {shiftmates.length > 0 ? (
                  <PeopleList people={shiftmates} styles={styles} title="Working with you" />
                ) : null}
              </View>
            );
          })}
        </View>
      </Screen>
    );
  }

  return (
    <Screen bottomPaddingMode="tabbed">
      <View style={styles.page}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" fit="fixed" style={styles.title}>
            {formatSplitDayTitle(date, todayDate)}
          </Text>
          <Text style={styles.unscheduled}>Unscheduled</Text>
        </View>
        {offDayPeople.length > 0 ? (
          <PeopleList people={offDayPeople} styles={styles} title="Working that day" />
        ) : null}
      </View>
    </Screen>
  );
}

const NO_SHIFTMATES: MobileScheduleEntry[] = [];

/** Who works beside the viewer, each with their job, under a heading. */
function PeopleList({
  people,
  title,
  styles,
}: {
  people: MobileScheduleEntry[];
  title: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.peopleCard}>
        {people.map((entry, index) => {
          const tone = getAvatarTone(entry.employeeId, isDark);
          const chip = getScheduleItemTypeChip(mobileColors, isDark, firstItemOf(entry));
          return (
            <View
              key={entry.employeeId}
              style={[styles.personRow, index > 0 && styles.personRowDivider]}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
                ]}
              >
                <Text fit="fixed" style={[styles.avatarText, { color: tone.textColor }]}>
                  {getInitials(entry.employeeName)}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.personName}>
                {entry.employeeName}
              </Text>
              <View style={styles.personJob}>
                <JobPill chip={chip} compact />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** A picked day's card: live today, Upcoming ahead, Scheduled once done, Away for an absence. */
function heroStatus(item: MeScheduleSegmentItem, todayDate: string, now: string): HeroStatus {
  if (getScheduleEntryAbsenceTypeId(item.entry) != null) return "away";
  if (item.date > todayDate) return "upcoming";
  if (item.date < todayDate) return "scheduled";
  const start = getSegmentStartTime(item.segment) ?? getScheduleEntryStartTime(item.entry);
  const end = getSegmentEndTime(item.segment) ?? getScheduleEntryEndTime(item.entry);
  if (start && now < start) return "upcoming";
  if (start && end && (end <= start || now < end)) return "active";
  return "scheduled";
}

/** Everyone working that day but the viewer, once each. */
function workingThatDay(
  teamEntries: MobileScheduleEntry[],
  date: string,
  viewerId: string | undefined,
): MobileScheduleEntry[] {
  const seen = new Set<string>();
  return teamEntries.filter((entry) => {
    if (entry.date !== date || entry.employeeId === viewerId || seen.has(entry.employeeId)) {
      return false;
    }
    if (isDeletedScheduleHistory(entry) || getScheduleEntryAbsenceTypeId(entry) != null) {
      return false;
    }
    seen.add(entry.employeeId);
    return true;
  });
}

function firstItemOf(entry: MobileScheduleEntry): MeScheduleSegmentItem | null {
  return (
    buildUpcomingMeScheduleItems({
      entries: [entry],
      featuredItem: null,
      selectedDate: entry.date,
    })[0] ?? null
  );
}

const AVATAR_SIZE = 40;

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      gap: mobileSpace.xl,
    },
    // The card's glow blurs 20pt, as wide as the page's gutter, so the pane's
    // edge cut it in a straight line; this room lets it fade out first.
    cards: {
      gap: mobileSpace["2xl"],
      paddingHorizontal: mobileSpace.md,
      paddingTop: mobileSpace.sm,
    },
    // A shift's card, then who works it with you.
    shift: {
      gap: mobileSpace.xl,
    },
    heading: {
      gap: mobileSpace.xs,
    },
    title: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    unscheduled: {
      ...mobileTextWeighted("rowTitle", "semibold"),
      color: mobileColors.textSecondary,
    },
    section: {
      gap: mobileSpace.sm,
    },
    sectionTitle: {
      ...mobileTextWeighted("rowTitle", "semibold"),
      color: mobileColors.textPrimary,
    },
    peopleCard: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderCurve: "continuous",
      paddingHorizontal: mobileSpace.lg,
    },
    personRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.md,
      paddingVertical: mobileSpace.md,
    },
    personRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      ...mobileTextWeighted("body", "medium"),
    },
    personName: {
      ...mobileTextWeighted("rowTitle", "semibold"),
      flex: 1,
      minWidth: 0,
      color: mobileColors.textPrimary,
    },
    personJob: {
      justifyContent: "center",
    },
  });
