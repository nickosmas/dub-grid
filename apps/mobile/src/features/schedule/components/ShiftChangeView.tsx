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
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import {
  DetailGroup,
  DetailNavLabel,
  DetailNavRow,
  DetailRowFrame,
} from "./shift-detail/DetailList";

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

/** One shift or absence of a side, as a row of that side's card. */
function ItemRow({
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
  const status = showStatus && (item.status === "added" || item.status === "removed");
  return (
    <DetailRowFrame style={styles.item}>
      {item.breakBefore ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.breakLine}>
          {`Break · ${hoursText(item.breakBefore.minutes)}, ${formatScheduleTimeValue(item.breakBefore.start)} - ${formatScheduleTimeValue(item.breakBefore.end)}`}
        </Text>
      ) : null}
      {item.label || status ? (
        <View style={styles.itemHeader}>
          {item.label ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.itemLabel}>
              {LABEL_TEXT[item.label]}
            </Text>
          ) : null}
          {status ? (
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
      ) : null}
      <Parts parts={item.title} style={styles.itemTitle} changedStyle={changedStyle} />
      {detailLines(item.detail).map((line, index) => (
        <Parts key={index} parts={line} style={styles.itemDetail} changedStyle={changedStyle} />
      ))}
    </DetailRowFrame>
  );
}

/** A side of the change as its own group: the heading over a card of its items. */
function SideGroup({
  heading,
  side,
  styles,
  highlight,
  showStatus = true,
}: {
  heading: string;
  side: ShiftChangeSide;
  styles: ReturnType<typeof createStyles>;
  highlight: boolean;
  showStatus?: boolean;
}) {
  return (
    <DetailGroup title={sideHeading(heading, side)} titleTone={highlight ? "brand" : "default"}>
      {side.items.length === 0 ? (
        <DetailRowFrame>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.noShift}>
            No shift
          </Text>
        </DetailRowFrame>
      ) : (
        side.items.map((item, index) => (
          <ItemRow
            key={index}
            item={item}
            styles={styles}
            highlight={highlight}
            showStatus={showStatus}
          />
        ))
      )}
    </DetailGroup>
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
    <DetailGroup>
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
    </DetailGroup>
  );
}

function accessibleSummary(change: ShiftChange): string {
  const side = (heading: string, value: ShiftChangeSide) =>
    `${heading}: ${value.items.length === 0 ? "No shift" : value.items.map((item) => item.plain).join("; ")}`;
  if (isNewShiftChange(change)) return side("New", change.after);
  return [side("Before", change.before), side("After", change.after)].join(". ");
}

/**
 * A shift change as Before and After groups, every field that tells the two
 * apart, the changed ones marked (item 46d). The web's ShiftChangeCard,
 * stacked for a phone as grouped rows.
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
      <View accessibilityLabel={accessibleSummary(change)} style={styles.groups}>
        <SideGroup heading="New" highlight showStatus={false} side={change.after} styles={styles} />
      </View>
    );
  }
  return (
    <View accessibilityLabel={accessibleSummary(change)} style={styles.groups}>
      {showDayBar ? <DayBar change={change} styles={styles} /> : null}
      <SideGroup heading="Before" highlight={false} side={change.before} styles={styles} />
      <SideGroup heading="After" highlight side={change.after} styles={styles} />
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
 * The "What changed" control that opens the sheet. Shift detail and Your Week
 * share it, so the two read and behave the same. `row` is a grouped list's
 * row with a chevron, for a screen that sets it in a card of rows.
 */
export function ShiftChangeButton({
  change,
  variant = "button",
}: {
  change: ShiftChange;
  variant?: "button" | "row";
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [open, setOpen] = useState(false);
  // A shift on a day that had nothing has nothing to compare; the entry shows it.
  if (change.kind === "none" || isNewShiftChange(change)) return null;
  return (
    <>
      {variant === "row" ? (
        <DetailNavRow accessibilityLabel="See what changed" onPress={() => setOpen(true)}>
          <DetailNavLabel>What changed</DetailNavLabel>
        </DetailNavRow>
      ) : (
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
      )}
      <ShiftChangeSheet change={change} visible={open} onDismiss={() => setOpen(false)} />
    </>
  );
}

function createStyles(colors: MobileColors) {
  return StyleSheet.create({
    groups: {
      gap: mobileSpace.lg,
    },
    item: {
      gap: mobileSpace.xs,
    },
    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    itemLabel: {
      ...mobileText.meta,
      color: colors.textMuted,
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
      ...mobileText.meta,
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
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: 1,
    },
    removedTag: {
      borderRadius: mobileRadii.pill,
      backgroundColor: colors.dangerSoft,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: 1,
    },
    addedTagText: {
      ...mobileTextWeighted("meta", "semibold"),
      color: colors.successText,
    },
    removedTagText: {
      ...mobileTextWeighted("meta", "semibold"),
      color: colors.dangerText,
    },
    bar: {
      gap: mobileSpace.xs,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
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
      ...mobileText.meta,
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
