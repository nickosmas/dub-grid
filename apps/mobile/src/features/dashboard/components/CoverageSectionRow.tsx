import { useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../../../shared/components/Text";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileListRow,
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { coverageColor } from "../lib/coverage";

export type CoverageSection = MobileDashboardResponse["coverageBySection"][number];

const CHEVRON_SIZE = 16;

// One focus area's coverage: its name, filled over required, the percentage
// in its tone, a 6pt meter. Shared by the Coverage card's breakdown and the
// full-page coverage screen (apps/mobile/app/(tabs)/home/coverage.tsx) so
// the two never drift. Opens the team schedule on this focus area, where the
// gap can be filled.
//
// The daily strip sits below the pressable rather than inside it: on iOS a
// horizontal ScrollView nested in a Pressable never gets to scroll, the drag
// lands as a press and the row navigates instead of paging.
export function CoverageSectionRow({ section }: { section: CoverageSection }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const pctColor = coverageColor(mobileColors, section.pct);
  const daily = section.daily ?? [];
  const [stripWidth, setStripWidth] = useState(0);
  const handleStripLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== stripWidth) setStripWidth(width);
  };
  return (
    <View style={styles.row}>
      <PressableRow
        accessibilityLabel={`${section.focusAreaName}, ${section.pct} percent covered`}
        onPress={() =>
          router.push({
            pathname: "/(tabs)/team",
            params: { focusAreaId: String(section.focusAreaId) },
          })
        }
        style={styles.pressable}
      >
        <View style={styles.rowBody}>
          <View style={styles.rowHeader}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.label}>
              {section.focusAreaName}
            </Text>
            <View style={styles.rowNumbers}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.filledText}>
                {section.filledTotal} / {section.requiredTotal} filled
              </Text>
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[styles.pctText, { color: pctColor }]}
              >
                {section.pct}%
              </Text>
            </View>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { backgroundColor: pctColor, width: `${section.pct}%` }]} />
          </View>
        </View>
        <Ionicons color={mobileColors.textMuted} name="chevron-forward" size={CHEVRON_SIZE} />
      </PressableRow>
      {daily.length > 0 ? (
        <View style={styles.strip}>
          {/* Measured inside the padding: the pages must match the strip's
              own box, not the padded wrapper's. */}
          <View onLayout={handleStripLayout}>
            <DailyStrip daily={daily} pageWidth={stripWidth} styles={styles} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

type CoverageDay = CoverageSection["daily"][number];
type Styles = ReturnType<typeof createStyles>;

// A week is as many columns as the count text can afford. Beyond that the
// strip pages a week at a time rather than squeezing 14 columns until
// "12/15" no longer fits one.
const DAYS_PER_PAGE = 7;

function chunkWeeks(daily: CoverageDay[]): CoverageDay[][] {
  const pages: CoverageDay[][] = [];
  for (let index = 0; index < daily.length; index += DAYS_PER_PAGE) {
    pages.push(daily.slice(index, index + DAYS_PER_PAGE));
  }
  return pages;
}

function WeekRow({ days, styles }: { days: CoverageDay[]; styles: Styles }) {
  const mobileColors = useMobileColors();
  return days.map((day) => (
    <View key={day.dateKey} style={styles.dayCell}>
      <Text fit="fixed" style={styles.dayLabel}>
        {dayLetter(day.dateKey)}
      </Text>
      <View style={[styles.dayDot, { backgroundColor: dayColor(mobileColors, day.status) }]} />
      <Text fit="fixed" style={[styles.dayCount, mobileTabularText]}>
        {day.status === "none" ? "-" : `${day.filledCount}/${day.requiredCount}`}
      </Text>
    </View>
  ));
}

function PageDots({
  count,
  activeIndex,
  styles,
}: {
  count: number;
  activeIndex: number;
  styles: Styles;
}) {
  const mobileColors = useMobileColors();
  return (
    <View accessibilityLabel={`Week ${activeIndex + 1} of ${count}`} style={styles.pageDots}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[
            styles.pageDot,
            {
              backgroundColor:
                index === activeIndex ? mobileColors.textMuted : mobileColors.borderSubtle,
            },
          ]}
        />
      ))}
    </View>
  );
}

// The strip's width is measured by the row's always-mounted wrapper and
// handed down, so the pager has its page width on its very first frame. When
// it measured inside the pager, the switch to 2 Weeks drew one frame of all
// fourteen columns squeezed together before the pages got a width.
function DailyStrip({
  daily,
  pageWidth,
  styles,
}: {
  daily: CoverageDay[];
  pageWidth: number;
  styles: Styles;
}) {
  const pages = useMemo(() => chunkWeeks(daily), [daily]);

  if (pages.length <= 1) {
    return (
      <View accessibilityLabel={describeDaily(daily)} style={styles.dailyRow}>
        <WeekRow days={daily} styles={styles} />
      </View>
    );
  }

  // Not measured yet (a cold mount straight into a two-week period): show the
  // first week flat, which is exactly what the pager's first page looks like,
  // rather than an unsized pager.
  if (pageWidth <= 0) {
    return (
      <View accessibilityLabel={describeDaily(daily)} style={styles.dailyPager}>
        <View style={styles.dailyRow}>
          <WeekRow days={pages[0]!} styles={styles} />
        </View>
        <PageDots activeIndex={0} count={pages.length} styles={styles} />
      </View>
    );
  }

  // Keyed on the period so a new one remounts the scroller at its first week.
  return (
    <WeekPager
      key={`${pages[0]?.[0]?.dateKey}:${pages.length}`}
      daily={daily}
      pageWidth={pageWidth}
      pages={pages}
      styles={styles}
    />
  );
}

function WeekPager({
  daily,
  pages,
  pageWidth,
  styles,
}: {
  daily: CoverageDay[];
  pages: CoverageDay[][];
  pageWidth: number;
  styles: Styles;
}) {
  const [activePage, setActivePage] = useState(0);
  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActivePage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  return (
    <View accessibilityLabel={describeDaily(daily)} style={styles.dailyPager}>
      <ScrollView
        decelerationRate="fast"
        horizontal
        nestedScrollEnabled
        onMomentumScrollEnd={handleMomentumScrollEnd}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
      >
        {pages.map((page) => (
          <View key={page[0]?.dateKey} style={[styles.dailyRow, { width: pageWidth }]}>
            <WeekRow days={page} styles={styles} />
          </View>
        ))}
      </ScrollView>
      <PageDots activeIndex={activePage} count={pages.length} styles={styles} />
    </View>
  );
}

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function dayLetter(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return DAY_LETTERS[new Date(y, m - 1, d).getDay()] ?? "";
}

function dayColor(mobileColors: MobileColors, status: CoverageDay["status"]): string {
  switch (status) {
    case "green":
      return mobileColors.success;
    case "amber":
      return mobileColors.warning;
    case "red":
      return mobileColors.danger;
    default:
      return mobileColors.borderSubtle;
  }
}

function describeDaily(daily: CoverageDay[]): string {
  return daily
    .map((day) =>
      day.status === "none"
        ? `${day.dateKey} no requirement`
        : `${day.dateKey} ${day.filledCount} of ${day.requiredCount} filled`,
    )
    .join(", ");
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    row: {
      paddingVertical: mobileListRow.paddingVertical,
      gap: mobileSpace.sm,
    },
    pressable: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    rowBody: {
      flex: 1,
      gap: mobileSpace.sm,
    },
    // Keeps the day columns on the meter's width, clear of the chevron column.
    strip: {
      paddingRight: CHEVRON_SIZE + mobileSpace.sm,
    },
    // Wraps so that at the larger text sizes the figures drop under the
    // name instead of squeezing it to its first letter.
    rowHeader: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: mobileSpace.sm,
    },
    rowNumbers: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: mobileSpace.sm,
      flexShrink: 0,
    },
    label: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
      flexShrink: 1,
    },
    filledText: {
      ...mobileText.caption,
      color: mobileColors.textSubtle,
    },
    pctText: {
      ...mobileText.bodyStrong,
    },
    track: {
      height: 6,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.borderSubtle,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: mobileRadii.pill,
    },
    // The daily grid web's expanded coverage panel shows, one column per day.
    // Fixed-size chrome: it must keep its shape at every text setting.
    dailyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: mobileSpace.xs,
    },
    dailyPager: {
      gap: mobileSpace.xs,
    },
    pageDots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: mobileSpace.xs,
    },
    pageDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    dayCell: {
      flex: 1,
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    dayLabel: {
      ...mobileText.micro,
      color: mobileColors.textSubtle,
    },
    dayDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    dayCount: {
      ...mobileText.micro,
      color: mobileColors.textMuted,
    },
  });
