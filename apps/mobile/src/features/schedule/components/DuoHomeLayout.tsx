import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { getScheduleMonthStartDate } from "@dubgrid/schedule-core";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { SegmentedSwitch } from "../../../shared/components/SegmentedSwitch";
import { Text } from "../../../shared/components/Text";
import { getScreenGutter } from "../../../shared/components/screen-layout";
import { TransparentPaneContext } from "../../../shared/layout/TransparentPaneContext";
import { HeaderAbovePanesContext } from "../../../shared/layout/DetailPaneContext";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, mobileText, type MobileColors } from "../../../shared/theme/tokens";

export type HomeSpan = "week" | "month";

// Open, the Duo puts its status bar in the side column and leaves no top
// inset, so the title would sit in the screen's rounded corner.
const CORNER_CLEARANCE = mobileSpace["2xl"];

const SPAN_OPTIONS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const satisfies ReadonlyArray<{ value: HomeSpan; label: string }>;

// Kept for the session, as Home's My schedule | Team is.
let lastHomeSpan: HomeSpan = "week";

/** Home's Week | Month on an open iPhone Duo, remembered while the app runs. */
export function useHomeSpan(): [HomeSpan, (next: HomeSpan) => void] {
  const [span, setSpan] = useState<HomeSpan>(lastHomeSpan);
  return [
    span,
    (next) => {
      lastHomeSpan = next;
      setSpan(next);
    },
  ];
}

/** The month Home's Month shows, the scroll the arrows ask for, and its entries for the hours. */
export function useHomeMonth(startDate: string) {
  const [visibleMonth, setVisibleMonth] = useState(() => getScheduleMonthStartDate(startDate));
  const [request, setRequest] = useState<{ month: string; nonce: number } | null>(null);
  const [entries, setEntries] = useState<MobileScheduleEntry[]>([]);
  const goToMonth = (month: string) => {
    setVisibleMonth(month);
    setRequest({ month, nonce: Date.now() });
  };
  return { visibleMonth, setVisibleMonth, request, entries, setEntries, goToMonth };
}

/** The first of the month `months` from `monthStart`. */
export function addMonthsToIso(monthStart: string, months: number): string {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

/**
 * Home on an open iPhone Duo: one header across the whole width, the week or
 * month named on the left with its dates and hours under it, My schedule |
 * Team and Week | Month on the right, and the view under it. The arrows and
 * Today stand in the side column.
 */
export function DuoHomeLayout({
  background,
  title,
  meta,
  loading = false,
  tall,
  view,
  span,
  children,
}: {
  background?: ReactNode;
  title: string;
  meta: string | null;
  loading?: boolean;
  /** Held tall: the switches narrow. */
  tall: boolean;
  /** My schedule | Team, for someone who has both. */
  view?: {
    value: "mine" | "team";
    options: ReadonlyArray<{ value: "mine" | "team"; label: string }>;
    onChange: (next: "mine" | "team") => void;
  };
  /** Week | Month, for My schedule. */
  span?: { value: HomeSpan; onChange: (next: HomeSpan) => void };
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const insets = useSafeAreaInsets();
  const gutter = getScreenGutter();
  const bodyInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);

  return (
    <View style={styles.page}>
      {background ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {background}
        </View>
      ) : null}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top + mobileSpace.sm, CORNER_CLEARANCE),
            paddingLeft: insets.left + gutter,
            paddingRight: insets.right + gutter,
          },
        ]}
      >
        <View style={styles.heading}>
          <Text accessibilityRole="header" fit="fixed" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            {meta ? (
              <Text fit="fixed" numberOfLines={1} style={styles.meta}>
                {meta}
              </Text>
            ) : null}
            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Loading"
                color={mobileColors.textSecondary}
                size="small"
              />
            ) : null}
          </View>
        </View>
        <View style={styles.switches}>
          {view ? (
            <SegmentedSwitch
              accessibilityLabel="Home view"
              options={view.options}
              style={{ width: tall ? 196 : 240 }}
              value={view.value}
              onChange={view.onChange}
            />
          ) : null}
          {span ? (
            <SegmentedSwitch
              accessibilityLabel="View"
              options={SPAN_OPTIONS}
              style={{ width: tall ? 140 : 170 }}
              value={span.value}
              onChange={span.onChange}
            />
          ) : null}
        </View>
      </View>
      <SafeAreaInsetsContext.Provider value={bodyInsets}>
        <TransparentPaneContext.Provider value={background != null}>
          <HeaderAbovePanesContext.Provider value={true}>
            <View style={styles.body}>{children}</View>
          </HeaderAbovePanesContext.Provider>
        </TransparentPaneContext.Provider>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: mobileSpace.md,
      paddingBottom: mobileSpace.md,
    },
    heading: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      ...mobileText.display,
      color: mobileColors.textPrimary,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    meta: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
    },
    switches: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    body: {
      flex: 1,
      minHeight: 0,
    },
  });
