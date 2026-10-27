import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatReturnDate } from "@dubgrid/domain";
import {
  addMonthsToIsoDate,
  buildScheduleMonthDays,
  formatDate,
  getScheduleMonthStartDate,
} from "@dubgrid/schedule-core";
import { Button } from "../../../shared/components/Button";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

export const RETURN_DATE_HINT =
  "They're back to Active on this day. Leave it empty to mark them active yourself.";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_SIZE = 36;

/** One month of days to pick a return date from; days before `minDate` are off. */
export function ReturnDateCalendar({
  value,
  minDate,
  onChange,
}: {
  value: string | null;
  /** The earliest return date (YYYY-MM-DD), the organization's tomorrow. */
  minDate: string;
  onChange: (date: string) => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [month, setMonth] = useState(() => getScheduleMonthStartDate(value ?? minDate));
  const weeks = useMemo(() => buildScheduleMonthDays(month, value ?? ""), [month, value]);
  const canGoBack = month > getScheduleMonthStartDate(minDate);
  const monthLabel = formatDate(month, { month: "long", year: "numeric" });

  return (
    <View style={styles.calendar}>
      <View style={styles.monthRow}>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoBack }}
          disabled={!canGoBack}
          hitSlop={8}
          onPress={() => setMonth(addMonthsToIsoDate(month, -1))}
          style={[styles.monthButton, !canGoBack && styles.dayDisabled]}
        >
          <Ionicons color={mobileColors.textSecondary} name="chevron-back" size={20} />
        </Pressable>
        <Text fit="fixed" style={styles.monthLabel}>
          {monthLabel}
        </Text>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setMonth(addMonthsToIsoDate(month, 1))}
          style={styles.monthButton}
        >
          <Ionicons color={mobileColors.textSecondary} name="chevron-forward" size={20} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((weekday, index) => (
          <Text fit="fixed" key={index} style={styles.weekday}>
            {weekday}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]?.date} style={styles.week}>
          {week.map((day) => {
            const disabled = day.date < minDate;
            return (
              <Pressable
                accessibilityLabel={`Choose ${formatReturnDate(day.date, { weekday: true })}`}
                accessibilityRole="button"
                accessibilityState={{ disabled, selected: day.isSelected }}
                disabled={disabled}
                key={day.date}
                onPress={() => onChange(day.date)}
                style={styles.daySlot}
              >
                <View
                  style={[
                    styles.day,
                    day.isSelected && styles.daySelected,
                    (disabled || !day.isCurrentMonth) && styles.dayDisabled,
                  ]}
                >
                  <Text
                    fit="fixed"
                    style={[styles.dayText, day.isSelected && styles.dayTextSelected]}
                  >
                    {day.dayLabel}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * The optional Return date field: the chosen day, the calendar under it while
 * open, and a way to leave it empty.
 */
export function ReturnDateField({
  value,
  minDate,
  onChange,
  disabled = false,
  initiallyOpen = false,
}: {
  value: string | null;
  minDate: string;
  onChange: (date: string | null) => void;
  disabled?: boolean;
  initiallyOpen?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Return date</Text>
      <Pressable
        accessibilityLabel={
          value ? `Return date, ${formatReturnDate(value, { weekday: true })}` : "Return date, none"
        }
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        style={styles.fieldShell}
      >
        <Ionicons color={mobileColors.textSubtle} name="calendar-outline" size={18} />
        <Text fit="compact" style={[styles.fieldValue, !value && styles.fieldPlaceholder]}>
          {value ? formatReturnDate(value, { weekday: true }) : "No return date"}
        </Text>
        <Ionicons
          color={mobileColors.textSubtle}
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
        />
      </Pressable>
      {open ? (
        <>
          <ReturnDateCalendar minDate={minDate} onChange={(date) => onChange(date)} value={value} />
          {value ? (
            <Button
              compact
              disabled={disabled}
              label="No return date"
              onPress={() => onChange(null)}
              tone="plain"
            />
          ) : null}
        </>
      ) : null}
      <Text style={styles.hint}>{RETURN_DATE_HINT}</Text>
    </View>
  );
}

function createStyles(mobileColors: MobileColors) {
  return StyleSheet.create({
    calendar: {
      gap: mobileSpace.xs,
    },
    monthRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: mobileSpace.xs,
    },
    monthButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    monthLabel: {
      ...mobileTextWeighted("rowTitle", "semibold"),
      ...mobileTabularText,
      color: mobileColors.textPrimary,
    },
    week: {
      flexDirection: "row",
    },
    weekday: {
      ...mobileTextWeighted("caption", "medium"),
      flex: 1,
      color: mobileColors.textSubtle,
      textAlign: "center",
    },
    daySlot: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    day: {
      width: DAY_SIZE,
      height: DAY_SIZE,
      borderRadius: DAY_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    daySelected: {
      backgroundColor: mobileColors.brand,
    },
    dayDisabled: {
      opacity: 0.35,
    },
    dayText: {
      ...mobileTextWeighted("rowTitle", "medium"),
      ...mobileTabularText,
      color: mobileColors.textPrimary,
    },
    dayTextSelected: {
      color: mobileColors.textInverse,
    },
    field: {
      gap: mobileSpace.sm,
    },
    fieldLabel: {
      ...mobileTextWeighted("caption", "medium"),
      color: mobileColors.textSubtle,
    },
    fieldShell: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      minHeight: 48,
      paddingHorizontal: mobileSpace.md,
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
    },
    fieldValue: {
      ...mobileTextWeighted("body", "regular"),
      ...mobileTabularText,
      flex: 1,
      color: mobileColors.textPrimary,
    },
    fieldPlaceholder: {
      color: mobileColors.textSubtle,
    },
    hint: {
      ...mobileTextWeighted("caption", "regular"),
      color: mobileColors.textSubtle,
    },
  });
}
