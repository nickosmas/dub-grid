import { useMemo, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  describeReturn,
  describeStatusCard,
  EMPLOYMENT_STATUS_LABELS,
  formatReturnDate,
  plannedLastDay,
  plannedReturn,
  statusMark,
  SUSPENDED_LABEL,
  type CurrentStatusState,
  type StatusAction,
  type StatusChoiceKind,
  type StatusMarkKind,
  type StatusState,
  type StatusTone,
} from "@dubgrid/domain";
import { formatLocalDateKey } from "@dubgrid/schedule-core";
import { Button } from "../../../shared/components/Button";
import { PressableRow } from "../../../shared/components/PressableRow";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { ProfileList } from "../../profile/components/ProfilePrimitives";
import {
  mobileListRow,
  mobileSpace,
  mobileTabularText,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

type IconName = ComponentProps<typeof Ionicons>["name"];

export const STATUS_MARK_ICONS: Record<StatusMarkKind, IconName> = {
  suspended: "lock-closed",
  away: "moon",
  planned: "calendar",
  archived: "person-remove",
};

/** The icon for each status a person can be in or be moved to. */
export const STATUS_KIND_ICONS: Record<StatusChoiceKind, IconName> = {
  active: "checkmark",
  away: "moon",
  suspended: "lock-closed",
  archived: "person-remove",
};

/** The tint of the status each choice leads to. */
export const STATUS_KIND_TONES: Record<StatusChoiceKind, StatusTone> = {
  active: "success",
  away: "warning",
  suspended: "danger",
  archived: "neutral",
};

export function statusToneColors(mobileColors: MobileColors, tone: StatusTone) {
  switch (tone) {
    case "success":
      return {
        bg: mobileColors.successSoft,
        border: mobileColors.successBorder,
        text: mobileColors.successText,
      };
    case "warning":
      return {
        bg: mobileColors.warningSoft,
        border: mobileColors.warningBorder,
        text: mobileColors.warningText,
      };
    case "danger":
      return {
        bg: mobileColors.dangerSoft,
        border: mobileColors.dangerBorder,
        text: mobileColors.dangerText,
      };
    case "neutral":
      return {
        bg: mobileColors.controlNeutralBg,
        border: mobileColors.borderSubtle,
        text: mobileColors.textSecondary,
      };
  }
}

/**
 * The status icon right after a person's name: a lock for Suspended, a moon
 * for Away, a calendar for a planned away, a person with a minus for Offboarded.
 */
export function StatusMarkIcon({ person, size = 14 }: { person: StatusState; size?: number }) {
  const mobileColors = useMobileColors();
  const mark = statusMark(person, formatLocalDateKey(new Date()));
  if (!mark) return null;
  return (
    <View accessible accessibilityLabel={mark.label} accessibilityRole="image" testID="status-mark">
      <Ionicons
        color={statusToneColors(mobileColors, mark.tone).text}
        name={STATUS_MARK_ICONS[mark.kind]}
        size={size}
      />
    </View>
  );
}

/** An icon in a tinted circle, for the status card and the Change status sheet. */
export function StatusIconCircle({
  name,
  tone,
  size = 32,
}: {
  name: IconName;
  tone: StatusTone;
  size?: number;
}) {
  const mobileColors = useMobileColors();
  const colors = statusToneColors(mobileColors, tone);
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderRadius: size / 2,
        borderWidth: 1,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Ionicons color={colors.text} name={name} size={Math.round(size / 2)} />
    </View>
  );
}

/** How Change status opens: one change on its own, the list, or a plan's dates alone. */
export interface StatusSheetOpening {
  only?: StatusAction;
  exclude?: StatusAction;
  /** A plan's dates alone (Edit plan), or the list of changes (the status row). */
  focus?: "plan" | "status";
}

/** A line under the status row: a fact with an optional link that acts on it. */
export interface StatusCardLine {
  key: string;
  icon: IconName;
  text: string;
  tone?: StatusTone;
  link?: {
    label: string;
    accessibilityLabel?: string;
    disabled?: boolean;
    onPress: () => void | Promise<unknown>;
  };
}

/**
 * A planned change in one line: "Away from Mon, Nov 10 to Fri, Nov 20",
 * "Last day Sun, Nov 8", "Suspended from Mon, Nov 10" or "Returns Mon, Nov 10".
 */
export function describePlannedLine(person: StatusState): string | null {
  if (person.status === "removed" || person.archivedAt) {
    const returnDay = plannedReturn(person);
    return returnDay ? describeReturn(returnDay, { weekday: true }) : null;
  }
  if (person.status !== "active") return null;
  const lastDay = plannedLastDay(person);
  if (lastDay) return `Last day ${formatReturnDate(lastDay, { weekday: true })}`;
  if (!person.plannedFrom) return null;
  const until = person.plannedUntil
    ? ` to ${formatReturnDate(person.plannedUntil, { weekday: true })}`
    : "";
  const from = formatReturnDate(person.plannedFrom, { weekday: true });
  if (person.plannedStatus === "suspended") return `${SUSPENDED_LABEL} from ${from}${until}`;
  if (person.plannedStatus === "away") {
    return `${EMPLOYMENT_STATUS_LABELS.inactive} from ${from}${until}`;
  }
  return null;
}

interface StaffStatusCardProps {
  person: CurrentStatusState & {
    firstDay?: string | null;
    awayAbsenceTypeId?: number | null;
    plannedAbsenceTypeId?: number | null;
  };
  absenceTypes: readonly { id: number; name?: string | null; label: string }[];
  /** Opens Change staff status; left off for someone who can't change it. */
  onChangeStatus?: (opening: StatusSheetOpening) => void;
  /** Lines after the planned change, such as where their invitation stands. */
  lines?: readonly StatusCardLine[];
  disabled?: boolean;
}

/**
 * Where someone stands, as one row that opens Change staff status, with a
 * line under it for each thing that applies: a first day or planned change,
 * then the lines the page adds.
 */
export function StaffStatusCard({
  person,
  absenceTypes,
  onChangeStatus,
  lines = [],
  disabled = false,
}: StaffStatusCardProps) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const absenceId =
    person.status === "inactive" ? person.awayAbsenceTypeId : person.plannedAbsenceTypeId;
  const absence = absenceTypes.find((absenceType) => absenceType.id === absenceId);
  const { current, starts } = describeStatusCard(person, {
    absenceName: absence ? (absence.name ?? absence.label) : null,
    today: formatLocalDateKey(new Date()),
  });
  const colors = statusToneColors(mobileColors, current.tone);
  const plannedText = describePlannedLine(person);
  const allLines: StatusCardLine[] = [
    ...(starts ? [{ key: "starts", icon: "calendar-outline" as const, text: starts.title }] : []),
    ...(plannedText
      ? [
          {
            key: "planned",
            icon: "calendar-outline" as const,
            text: plannedText,
            link: onChangeStatus
              ? {
                  label: "Edit plan",
                  disabled,
                  onPress: () => onChangeStatus({ focus: "plan" }),
                }
              : undefined,
          },
        ]
      : []),
    ...lines,
  ];
  const rowContent = (
    <>
      <StatusIconCircle name={STATUS_KIND_ICONS[current.kind]} tone={current.tone} />
      <View style={styles.copy}>
        <Text
          style={[
            styles.title,
            { color: current.kind === "active" ? mobileColors.textPrimary : colors.text },
          ]}
        >
          {current.title}
        </Text>
        <Text style={styles.detail}>{current.detail}</Text>
      </View>
    </>
  );
  const label = `Status: ${current.title}. ${current.detail}`;

  return (
    <View testID="status-card">
      <ProfileList>
        {onChangeStatus ? (
          <PressableRow
            accessibilityLabel={label}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onChangeStatus({ focus: "status" })}
            style={styles.row}
          >
            {rowContent}
            <Ionicons color={mobileColors.textSubtle} name="chevron-forward" size={22} />
          </PressableRow>
        ) : (
          <View accessibilityLabel={label} accessibilityRole="summary" style={styles.row}>
            {rowContent}
          </View>
        )}
        {allLines.map((line) => (
          <View key={line.key} style={styles.line} testID={`status-line-${line.key}`}>
            <View style={styles.lineDivider} />
            <Ionicons
              color={
                line.tone
                  ? statusToneColors(mobileColors, line.tone).text
                  : mobileColors.textSecondary
              }
              name={line.icon}
              size={16}
            />
            <Text style={styles.lineText}>{line.text}</Text>
            {line.link ? (
              <Button
                accessibilityLabel={line.link.accessibilityLabel}
                disabled={line.link.disabled}
                fullWidth={false}
                label={line.link.label}
                onPress={line.link.onPress}
                size="sm"
                tone="link"
              />
            ) : null}
          </View>
        ))}
      </ProfileList>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      minHeight: mobileListRow.minHeight,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.md,
    },
    copy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    title: {
      ...mobileTextWeighted("rowTitle", "semibold"),
      ...mobileTabularText,
    },
    detail: {
      ...mobileText.meta,
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
    line: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.sm,
      minHeight: mobileListRow.minHeight,
      paddingLeft: mobileSpace.lg,
      paddingRight: mobileSpace.sm,
      paddingVertical: mobileSpace.xs,
    },
    lineDivider: {
      backgroundColor: mobileColors.borderSubtle,
      height: StyleSheet.hairlineWidth,
      left: mobileSpace.lg,
      position: "absolute",
      right: 0,
      top: 0,
    },
    lineText: {
      ...mobileText.meta,
      ...mobileTabularText,
      color: mobileColors.textSecondary,
      flex: 1,
      minWidth: 0,
    },
  });
