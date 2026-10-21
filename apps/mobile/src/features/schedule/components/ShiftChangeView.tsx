import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { shiftChangeSchema } from "@dubgrid/contracts";
import { formatScheduleTimeValue, formatShiftChangeHours } from "@dubgrid/schedule-core";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileRadii,
  mobileRadius,
  mobileSpace,
  mobileTabularText,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

export type ShiftChange = z.infer<typeof shiftChangeSchema>;
type ShiftChangeSide = ShiftChange["before"];
type ShiftChangeItem = ShiftChangeSide["items"][number];
type TextPart = ShiftChangeItem["title"][number];

const LABEL_TEXT = { shift1: "Shift 1", shift2: "Shift 2", absence: "Absence" } as const;

function hoursText(minutes: number): string {
  return formatShiftChangeHours(minutes);
}

function sideHeading(heading: string, side: ShiftChangeSide): string {
  return side.totalMinutes != null ? `${heading} · ${hoursText(side.totalMinutes)}` : heading;
}

const SEPARATOR = " · ";

/**
 * The detail as lines, split where the model joins its fields: the times
 * with their hours on one line, the focus area on the next, so a narrow row
 * never breaks a name in two.
 */
function detailLines(parts: TextPart[]): TextPart[][] {
  const lines: TextPart[][] = [[]];
  for (const part of parts) {
    if (part.text === SEPARATOR) lines.push([]);
    else lines[lines.length - 1]!.push(part);
  }
  return lines.filter((line) => line.length > 0);
}

function Parts({
  parts,
  style,
  changedStyle,
}: {
  parts: TextPart[];
  style: object;
  changedStyle: object;
}) {
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={style}>
      {parts.map((part, index) => (
        <Text key={index} style={part.changed ? changedStyle : undefined}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

function ItemLines({
  item,
  styles,
  highlight,
  compact = false,
}: {
  item: ShiftChangeItem;
  styles: ReturnType<typeof createStyles>;
  highlight: boolean;
  compact?: boolean;
}) {
  const changedStyle = highlight ? styles.changed : styles.unchanged;
  return (
    <View style={styles.item}>
      {item.breakBefore ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.breakLine}>
          {`Break · ${hoursText(item.breakBefore.minutes)}, ${formatScheduleTimeValue(item.breakBefore.start)} - ${formatScheduleTimeValue(item.breakBefore.end)}`}
        </Text>
      ) : null}
      <View style={styles.itemHeader}>
        {item.label ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.itemLabel}>
            {LABEL_TEXT[item.label]}
          </Text>
        ) : null}
        {item.status === "added" || item.status === "removed" ? (
          <View style={item.status === "added" ? styles.addedTag : styles.removedTag}>
            <Text
              fit="compact"
              style={item.status === "added" ? styles.addedTagText : styles.removedTagText}
            >
              {item.status === "added" ? "Added" : "Removed"}
            </Text>
          </View>
        ) : null}
      </View>
      <Parts
        parts={item.title}
        style={compact ? styles.compactTitle : styles.itemTitle}
        changedStyle={changedStyle}
      />
      {detailLines(item.detail).map((line, index) => (
        <Parts
          key={index}
          parts={line}
          style={compact ? styles.compactDetail : styles.itemDetail}
          changedStyle={changedStyle}
        />
      ))}
    </View>
  );
}

function SideItems({
  side,
  styles,
  highlight,
  compact = false,
}: {
  side: ShiftChangeSide;
  styles: ReturnType<typeof createStyles>;
  highlight: boolean;
  compact?: boolean;
}) {
  if (side.items.length === 0) {
    return (
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.noShift}>
        No shift
      </Text>
    );
  }
  return (
    <View style={styles.items}>
      {side.items.map((item, index) => (
        <ItemLines
          key={index}
          item={item}
          styles={styles}
          highlight={highlight}
          compact={compact}
        />
      ))}
    </View>
  );
}

/** Both sides of a day on one scale; a break is the gap between two bars. */
function DayBar({
  change,
  styles,
}: {
  change: ShiftChange;
  styles: ReturnType<typeof createStyles>;
}) {
  const scale = change.barScale;
  if (!scale || scale.minutes <= 0) return null;
  const track = (side: ShiftChangeSide, after: boolean) => (
    <View style={styles.barTrack}>
      {side.items.map((item, index) =>
        item.bar ? (
          <View
            key={index}
            style={[
              styles.barSegment,
              item.kind === "absence"
                ? styles.barAbsence
                : after
                  ? styles.barAfter
                  : styles.barBefore,
              {
                left: `${(item.bar.from / scale.minutes) * 100}%`,
                width: `${Math.max(((item.bar.to - item.bar.from) / scale.minutes) * 100, 2)}%`,
              },
            ]}
          />
        ) : null,
      )}
    </View>
  );
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.bar}
    >
      {track(change.before, false)}
      {track(change.after, true)}
      <View style={styles.barScale}>
        <Text fit="fixed" style={styles.barScaleText}>
          {formatScheduleTimeValue(scale.start)}
        </Text>
        <Text fit="fixed" style={styles.barScaleText}>
          {formatScheduleTimeValue(scale.end)}
        </Text>
      </View>
    </View>
  );
}

function accessibleSummary(change: ShiftChange): string {
  const side = (heading: string, value: ShiftChangeSide) =>
    `${heading}: ${value.items.length === 0 ? "No shift" : value.items.map((item) => item.plain).join("; ")}`;
  return [side("Before", change.before), side("After", change.after)].join(". ");
}

/**
 * A shift change as Before and After headings, every field that tells the two
 * apart, the changed ones marked (item 46d). The web's ShiftChangeCard,
 * stacked for a phone.
 */
export function ShiftChangeCard({
  change,
  showDayBar = false,
}: {
  change: ShiftChange;
  showDayBar?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  if (change.kind === "none") return null;
  return (
    <View accessibilityLabel={accessibleSummary(change)} style={styles.card}>
      {showDayBar ? <DayBar change={change} styles={styles} /> : null}
      <View style={styles.side}>
        <Text fit="fixed" style={styles.heading}>
          {sideHeading("BEFORE", change.before)}
        </Text>
        <SideItems side={change.before} styles={styles} highlight={false} />
      </View>
      <View style={[styles.side, styles.afterSide]}>
        <Text fit="fixed" style={[styles.heading, styles.afterHeading]}>
          {sideHeading("AFTER", change.after)}
        </Text>
        <SideItems side={change.after} styles={styles} highlight />
      </View>
    </View>
  );
}

/** "Was" beside a shift already on screen: the earlier side only, in the same heading style. */
export function ShiftChangeWas({ change }: { change: ShiftChange }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  if (change.kind === "none") return null;
  return (
    <View
      accessibilityLabel={`Was: ${change.before.items.length === 0 ? "No shift" : change.before.items.map((item) => item.plain).join("; ")}`}
      style={styles.was}
    >
      <View style={styles.wasHeader}>
        <Text fit="fixed" style={styles.heading}>
          WAS
        </Text>
        {change.before.totalMinutes != null ? (
          <Text fit="fixed" style={styles.wasTotal}>
            {hoursText(change.before.totalMinutes)}
          </Text>
        ) : null}
      </View>
      <SideItems side={change.before} styles={styles} highlight={false} compact />
    </View>
  );
}

function createStyles(colors: MobileColors) {
  return StyleSheet.create({
    card: {
      borderRadius: mobileRadii.control,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    side: {
      gap: mobileSpace.xs,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    afterSide: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    heading: {
      ...mobileText.micro,
      ...mobileTabularText,
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    afterHeading: {
      color: colors.brand,
    },
    items: {
      gap: mobileSpace.sm,
    },
    item: {
      gap: mobileSpace.xs,
    },
    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    itemLabel: {
      ...mobileText.caption,
      color: colors.textSecondary,
    },
    itemTitle: {
      ...mobileText.bodyStrong,
      color: colors.textPrimary,
    },
    itemDetail: {
      ...mobileText.body,
      ...mobileTabularText,
      color: colors.textSecondary,
    },
    changed: {
      color: colors.brand,
      backgroundColor: colors.brandSoft,
    },
    unchanged: {},
    breakLine: {
      ...mobileText.caption,
      ...mobileTabularText,
      color: colors.textMuted,
    },
    noShift: {
      ...mobileText.body,
      color: colors.textMuted,
    },
    addedTag: {
      borderRadius: mobileRadii.pill,
      backgroundColor: colors.successSoft,
      paddingHorizontal: mobileSpace.xs,
    },
    removedTag: {
      borderRadius: mobileRadii.pill,
      backgroundColor: colors.dangerSoft,
      paddingHorizontal: mobileSpace.xs,
    },
    addedTagText: {
      ...mobileText.badge,
      color: colors.successText,
    },
    removedTagText: {
      ...mobileText.badge,
      color: colors.dangerText,
    },
    bar: {
      gap: mobileSpace.xs,
      paddingHorizontal: mobileSpace.md,
      paddingTop: mobileSpace.sm,
    },
    barTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.surfaceSecondary,
    },
    barSegment: {
      position: "absolute",
      top: 0,
      bottom: 0,
      borderRadius: 4,
    },
    barBefore: {
      backgroundColor: colors.textMuted,
    },
    barAfter: {
      backgroundColor: colors.brand,
    },
    barAbsence: {
      backgroundColor: colors.warningSoft,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      borderStyle: "dashed",
    },
    barScale: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    barScaleText: {
      ...mobileText.micro,
      ...mobileTabularText,
      color: colors.textMuted,
    },
    was: {
      gap: mobileSpace.xs,
      marginTop: mobileSpace.sm,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
      borderRadius: mobileRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.surfaceSecondary,
    },
    wasHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: mobileSpace.sm,
    },
    wasTotal: {
      ...mobileText.caption,
      ...mobileTabularText,
      color: colors.textSecondary,
    },
    compactTitle: {
      ...mobileTextWeighted("meta", "semibold"),
      color: colors.textPrimary,
    },
    compactDetail: {
      ...mobileText.meta,
      ...mobileTabularText,
      color: colors.textSecondary,
    },
  });
}
