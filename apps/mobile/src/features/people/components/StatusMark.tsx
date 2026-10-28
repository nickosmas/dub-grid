import { useMemo, useState, type ComponentProps } from "react";
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
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { useModalHandoff } from "../../../shared/hooks/useModalHandoff";
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
  const [moreOpen, setMoreOpen] = useState(false);
  const handoff = useModalHandoff();
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
  // active, Restore); a menu names each other change, and for someone Away
  // their return date. Every one opens a confirmation for that change alone.
  const suggested = plain ? null : suggestedStatusChoice(person);
  const away = person.status === "inactive" && !person.archivedAt;
  const moreItems: { key: string; label: string; opening: StatusSheetOpening }[] = suggested
    ? [
        ...(away
          ? [
              {
                key: "details",
                label: describeStatusAction("setReturnDate", "", {
                  currentReturnDate: person.awayUntil ?? null,
                  returnDate: person.awayUntil ?? null,
                }).label,
                opening: { focus: "plan" as const },
              },
            ]
          : []),
        ...statusChoices(person)
          .filter((choice) => choice.action !== suggested.action)
          .map((choice) => ({
            key: choice.action,
            label: describeStatusAction(choice.action, "").label,
            opening: { only: choice.action },
          })),
      ]
    : [];
  const actions = !onChangeStatus ? null : suggested ? (
    <View style={styles.actions}>
      <View style={styles.action}>
        <Button
          disabled={disabled}
          label={describeStatusAction(suggested.action, "").label}
          onPress={() => onChangeStatus({ only: suggested.action })}
          tone="secondary"
        />
      </View>
      {moreItems.length > 0 ? (
        <Button
          accessibilityLabel="More status changes"
          disabled={disabled}
          expanded={moreOpen}
          icon="ellipsis-horizontal"
          iconOnly
          onPress={() => setMoreOpen(true)}
          tone="secondary"
        />
      ) : null}
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
      {onChangeStatus && moreItems.length > 0 ? (
        <BottomSheetModal
          debugName="More status changes"
          header={<SheetHeader title="More status changes" />}
          onDismiss={() => setMoreOpen(false)}
          visible={moreOpen}
        >
          <View style={styles.stack}>
            {moreItems.map((item) => (
              <Button
                key={item.key}
                label={item.label}
                onPress={() => {
                  setMoreOpen(false);
                  // The status sheet waits for this one to finish leaving.
                  handoff(() => onChangeStatus(item.opening));
                }}
                tone="secondary"
              />
            ))}
          </View>
        </BottomSheetModal>
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
