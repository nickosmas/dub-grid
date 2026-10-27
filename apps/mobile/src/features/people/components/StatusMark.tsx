import { useMemo, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  describeStatusAction,
  describeStatusCard,
  statusChoices,
  statusMark,
  suggestedStatusChoice,
  type CurrentStatusState,
  type StatusAction,
  type StatusChoiceKind,
  type StatusMarkKind,
  type StatusState,
  type StatusTone,
} from "@dubgrid/domain";
import { Button } from "../../../shared/components/Button";
import { Text } from "../../../shared/components/Text";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
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
  archived: "archive",
};

/** The icon for each status a person can be in or be moved to. */
export const STATUS_KIND_ICONS: Record<StatusChoiceKind, IconName> = {
  active: "checkmark",
  away: "moon",
  suspended: "lock-closed",
  archived: "archive",
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
 * for Away, a calendar for a planned away, an archive box for Archived.
 */
export function StatusMarkIcon({ person, size = 14 }: { person: StatusState; size?: number }) {
  const mobileColors = useMobileColors();
  const mark = statusMark(person);
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

/** How Change status opens: one change on its own, or the list without one already offered. */
export interface StatusSheetOpening {
  only?: StatusAction;
  exclude?: StatusAction;
  /** A planned away's dates alone (Edit plan), or the list alone (Change status). */
  focus?: "plan" | "status";
}

interface StatusCardsProps {
  person: CurrentStatusState & {
    awayAbsenceTypeId?: number | null;
    plannedAbsenceTypeId?: number | null;
  };
  absenceTypes: readonly { id: number; name?: string | null; label: string }[];
  /** Opens Change status; left off for someone who can't change it. */
  onChangeStatus?: (opening: StatusSheetOpening) => void;
  disabled?: boolean;
  /**
   * Tinted like their pill on the profile; the sheet draws it plain, since the
   * choices below carry the colour there.
   */
  plain?: boolean;
}

/**
 * Where someone stands, in the Change status dialog's words, with a dashed
 * second card for an Away planned for later.
 */
export function StatusCards({
  person,
  absenceTypes,
  onChangeStatus,
  disabled = false,
  plain = false,
}: StatusCardsProps) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const absenceId =
    person.status === "inactive" ? person.awayAbsenceTypeId : person.plannedAbsenceTypeId;
  const absence = absenceTypes.find((absenceType) => absenceType.id === absenceId);
  const { current, planned } = describeStatusCard(person, {
    absenceName: absence ? (absence.name ?? absence.label) : null,
  });
  const quiet = plain || current.kind === "active";
  const colors = statusToneColors(mobileColors, current.tone);
  const warning = statusToneColors(mobileColors, "warning");
  // The change most people want next gets its own button (Reinstate, Mark
  // active, Restore); the other button lists the rest, or names a lone one.
  const suggested = plain ? null : suggestedStatusChoice(person);
  const rest = suggested
    ? statusChoices(person).filter((choice) => choice.action !== suggested.action)
    : [];
  // Someone Away keeps Change status: it also edits their return date.
  const nameLone = rest.length === 1 && person.status !== "inactive";
  const actions = !onChangeStatus ? null : suggested ? (
    <View style={styles.actions}>
      {rest.length > 0 ? (
        <View style={styles.action}>
          <Button
            disabled={disabled}
            label={nameLone ? describeStatusAction(rest[0].action, "").label : "Change status"}
            onPress={() =>
              onChangeStatus(nameLone ? { only: rest[0].action } : { exclude: suggested.action })
            }
            tone="plain"
          />
        </View>
      ) : null}
      <View style={styles.action}>
        <Button
          disabled={disabled}
          label={describeStatusAction(suggested.action, "").label}
          onPress={() => onChangeStatus({ only: suggested.action })}
          tone="secondary"
        />
      </View>
    </View>
  ) : (
    <Button
      disabled={disabled}
      label="Change status"
      onPress={() => onChangeStatus({ focus: "status" })}
      tone="secondary"
    />
  );

  return (
    <View style={styles.stack}>
      <View
        accessibilityLabel={`Status: ${current.title}. ${current.detail}`}
        accessibilityRole="summary"
        style={[
          styles.card,
          quiet
            ? { backgroundColor: mobileColors.surface, borderColor: mobileColors.borderSubtle }
            : { backgroundColor: colors.bg, borderColor: colors.border },
        ]}
        testID="status-card"
      >
        <View style={styles.row}>
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
        </View>
        {actions}
      </View>
      {planned ? (
        <View
          accessibilityLabel={`Planned: ${planned.title}. ${planned.detail}`}
          accessibilityRole="summary"
          style={[
            styles.card,
            styles.dashed,
            { backgroundColor: mobileColors.surface, borderColor: warning.border },
          ]}
          testID="planned-card"
        >
          <View style={styles.row}>
            <StatusIconCircle name="calendar" tone="warning" />
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>Planned</Text>
              <Text style={[styles.title, { color: warning.text }]}>{planned.title}</Text>
              <Text style={styles.detail}>{planned.detail}</Text>
            </View>
          </View>
          {onChangeStatus && !plain ? (
            <Button
              disabled={disabled}
              label="Edit plan"
              onPress={() => onChangeStatus({ focus: "plan" })}
              tone="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    stack: {
      gap: mobileSpace.sm,
    },
    card: {
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      gap: mobileSpace.md,
      padding: mobileSpace.md,
    },
    actions: {
      flexDirection: "row",
      gap: mobileSpace.sm,
    },
    action: {
      flex: 1,
    },
    dashed: {
      borderStyle: "dashed",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
    },
    copy: {
      flex: 1,
      gap: mobileSpace.xs,
      minWidth: 0,
    },
    eyebrow: {
      ...mobileTextWeighted("caption", "semibold"),
      color: mobileColors.textSecondary,
    },
    title: {
      ...mobileTextWeighted("body", "semibold"),
      ...mobileTabularText,
    },
    detail: {
      ...mobileText.caption,
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
  });
