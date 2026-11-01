import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { shiftChangeSchema } from "@dubgrid/contracts";
import {
  formatScheduleTimeValue,
  formatShiftChangeHours,
  isNewShiftChange,
} from "@dubgrid/schedule-core";
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileText,
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
  showStatus,
}: {
  item: ShiftChangeItem;
  styles: ReturnType<typeof createStyles>;
  highlight: boolean;
  showStatus: boolean;
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
        {showStatus && (item.status === "added" || item.status === "removed") ? (
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
      <Parts parts={item.title} style={styles.itemTitle} changedStyle={changedStyle} />
      {detailLines(item.detail).map((line, index) => (
        <Parts key={index} parts={line} style={styles.itemDetail} changedStyle={changedStyle} />
      ))}
    </View>
  );
}

function SideItems({
  side,
  styles,
  highlight,
  showStatus = true,
}: {
  side: ShiftChangeSide;
  styles: ReturnType<typeof createStyles>;
  highlight: boolean;
  showStatus?: boolean;
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
          showStatus={showStatus}
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
  if (isNewShiftChange(change)) return side("New", change.after);
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
  if (isNewShiftChange(change)) {
    return (
      <View accessibilityLabel={accessibleSummary(change)} style={styles.card}>
        <View style={styles.side}>
          <Text fit="fixed" style={[styles.heading, styles.afterHeading]}>
            {sideHeading("NEW", change.after)}
          </Text>
          <SideItems side={change.after} styles={styles} highlight showStatus={false} />
        </View>
      </View>
    );
  }
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

/** The "What changed" sheet: the whole day Before and After, with the day bar. */
export function ShiftChangeSheet({
  change,
  visible,
  onDismiss,
}: {
  change: ShiftChange;
  visible: boolean;
  onDismiss: () => void;
}) {
  return (
    <BottomSheetModal
      accessibilityLabel="Dismiss what changed"
      debugName="What changed"
      header={<SheetHeader title="What changed" />}
      visible={visible}
      onDismiss={onDismiss}
    >
      <ShiftChangeCard change={change} showDayBar />
    </BottomSheetModal>
  );
}

/**
 * The "What changed" button that opens the sheet. Shift detail and Your Week
 * share it, so the two read and behave the same.
 */
export function ShiftChangeButton({ change }: { change: ShiftChange }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [open, setOpen] = useState(false);
  // A shift on a day that had nothing has nothing to compare; the entry shows it.
  if (change.kind === "none" || isNewShiftChange(change)) return null;
  return (
    <>
      <PressableRow
        accessibilityLabel="See what changed"
        onPress={() => setOpen(true)}
        style={styles.button}
      >
        <Ionicons color={mobileColors.textSubtle} name="arrow-undo-outline" size={16} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.buttonText}>
          What changed
        </Text>
        <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={18} />
      </PressableRow>
      <ShiftChangeSheet change={change} visible={open} onDismiss={() => setOpen(false)} />
    </>
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
    button: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: mobileRadii.control,
      backgroundColor: "transparent",
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
    },
    buttonText: {
      flex: 1,
      minWidth: 0,
      ...mobileText.bodyStrong,
      color: colors.textSecondary,
    },
  });
}
