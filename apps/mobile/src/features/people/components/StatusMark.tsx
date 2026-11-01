import { useMemo, useState, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  describeStatusAction,
  describeStatusCard,
  availableStatusChoices,
  statusMark,
  suggestedStatusChoice,
  type CurrentStatusState,
  type StatusAction,
  type StatusChoiceKind,
  type StatusMarkKind,
  type StatusState,
  type StatusTone,
} from "@dubgrid/domain";
import { formatLocalDateKey } from "@dubgrid/schedule-core";
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { useModalHandoff } from "../../../shared/hooks/useModalHandoff";
import { Text } from "../../../shared/components/Text";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  ProfileList,
  ProfileListAction,
  groupedCardEdge,
} from "../../profile/components/ProfilePrimitives";
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
        // A tinted fill alone on the platforms' lists, as their status marks are.
        borderWidth: IS_NATIVE_LIST ? 0 : 1,
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
  /** False when this manager may not offboard or restore them (51k). */
  canOffboard?: boolean;
  disabled?: boolean;
  /**
   * Tinted like their pill on the profile; the sheet draws it plain, since the
   * choices below carry the colour there.
   */
  plain?: boolean;
  /** Where their app access stands, as a row of the status group on a phone. */
  accessNote?: { title: string; detail?: string; tone: "info" | "warning" } | null;
}

/**
 * Where someone stands, in the Change status dialog's words, with a dashed
 * second card for an Away planned for later.
 */
export function StatusCards({
  person,
  absenceTypes,
  onChangeStatus,
  canOffboard = true,
  disabled = false,
  plain = false,
  accessNote = null,
}: StatusCardsProps) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const [moreOpen, setMoreOpen] = useState(false);
  const handoff = useModalHandoff();
  const absenceId =
    person.status === "inactive" ? person.awayAbsenceTypeId : person.plannedAbsenceTypeId;
  const absence = absenceTypes.find((absenceType) => absenceType.id === absenceId);
  const { current, planned, starts } = describeStatusCard(person, {
    absenceName: absence ? (absence.name ?? absence.label) : null,
    today: formatLocalDateKey(new Date()),
  });
  const quiet = plain || current.kind === "active";
  const colors = statusToneColors(mobileColors, current.tone);
  const warning = statusToneColors(mobileColors, "warning");
  // The change most people want next gets its own button (Reinstate, Mark
  // active, Restore); a menu names each other change that can be made now,
  // and for someone Away their return date. Every one opens a confirmation
  // for that change alone. Someone Active gets Change status, or a button
  // named for the one change left, or none when nothing can change now.
  const suggested = plain ? null : suggestedStatusChoice(person, { canOffboard });
  const available = availableStatusChoices(person, { canOffboard });
  const away = person.status === "inactive" && !person.archivedAt;
  const suspended = person.status === "active" && !person.archivedAt && Boolean(person.suspendedAt);
  const moreItems: { key: string; label: string; opening: StatusSheetOpening }[] = suggested
    ? [
        ...(suspended
          ? [
              {
                key: "details",
                label: describeStatusAction("setSuspendedUntil", "", {
                  currentReturnDate: person.suspendedUntil ?? null,
                  returnDate: person.suspendedUntil ?? null,
                }).label,
                opening: { focus: "plan" as const },
              },
            ]
          : []),
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
        ...available
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
  ) : available.length === 0 ? null : available.length === 1 ? (
    <Button
      disabled={disabled}
      label={describeStatusAction(available[0].action, "").label}
      onPress={() => onChangeStatus({ only: available[0].action })}
      tone="secondary"
    />
  ) : (
    <Button
      disabled={disabled}
      label="Change status"
      onPress={() => onChangeStatus({ focus: "status" })}
      tone="secondary"
    />
  );

  const moreSheet =
    onChangeStatus && moreItems.length > 0 ? (
      <BottomSheetModal
        debugName="More status changes"
        header={<SheetHeader title="More status changes" />}
        onDismiss={() => setMoreOpen(false)}
        visible={moreOpen}
      >
        {IS_NATIVE_LIST ? (
          <ProfileList>
            {moreItems.map((item, index) => (
              <ProfileListAction
                isLast={index === moreItems.length - 1}
                key={item.key}
                label={item.label}
                onPress={() => {
                  setMoreOpen(false);
                  handoff(() => onChangeStatus(item.opening));
                }}
              />
            ))}
          </ProfileList>
        ) : (
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
        )}
      </BottomSheetModal>
    ) : null;

  if (IS_NATIVE_LIST) {
    // A grouped section, as Settings states a fact and offers what to do
    // about it: where they stand as a row, then each change as a tinted row.
    const rowActions: { key: string; label: string; onPress: () => void }[] = !onChangeStatus
      ? []
      : suggested
        ? [
            {
              key: suggested.action,
              label: describeStatusAction(suggested.action, "").label,
              onPress: () => onChangeStatus({ only: suggested.action }),
            },
            ...(moreItems.length > 0
              ? [{ key: "more", label: "More status changes", onPress: () => setMoreOpen(true) }]
              : []),
          ]
        : available.length === 1
          ? [
              {
                key: available[0].action,
                label: describeStatusAction(available[0].action, "").label,
                onPress: () => onChangeStatus({ only: available[0].action }),
              },
            ]
          : available.length > 1
            ? [
                {
                  key: "change",
                  label: "Change status",
                  onPress: () => onChangeStatus({ focus: "status" }),
                },
              ]
            : [];
    const planActions =
      planned && onChangeStatus && !plain
        ? [{ key: "plan", label: "Edit plan", onPress: () => onChangeStatus({ focus: "plan" }) }]
        : [];
    return (
      <View style={styles.stack}>
        <View
          accessibilityLabel={`Status: ${current.title}. ${current.detail}`}
          accessibilityRole="summary"
          style={styles.group}
          testID="status-card"
        >
          <StatusGroupRow
            detail={current.detail}
            divided={Boolean(accessNote) || rowActions.length > 0}
            icon={STATUS_KIND_ICONS[current.kind]}
            title={current.title}
            titleColor={quiet ? mobileColors.textPrimary : colors.text}
            tone={current.tone}
          />
          {accessNote ? (
            <StatusGroupRow
              detail={accessNote.detail}
              divided={rowActions.length > 0}
              icon={
                accessNote.tone === "warning" ? "mail-unread-outline" : "phone-portrait-outline"
              }
              title={accessNote.title}
              titleColor={mobileColors.textPrimary}
              tone={accessNote.tone === "warning" ? "warning" : "neutral"}
            />
          ) : null}
          {rowActions.map((action, index) => (
            <ProfileListAction
              disabled={disabled}
              isLast={index === rowActions.length - 1}
              key={action.key}
              label={action.label}
              onPress={action.onPress}
            />
          ))}
        </View>
        {starts ? (
          <View
            accessibilityLabel={`First day: ${starts.title}. ${starts.detail}`}
            accessibilityRole="summary"
            style={styles.group}
            testID="starts-card"
          >
            <StatusGroupRow
              detail={starts.detail}
              eyebrow="First day"
              icon="calendar"
              title={starts.title}
              titleColor={warning.text}
              tone="warning"
            />
          </View>
        ) : null}
        {planned ? (
          <View
            accessibilityLabel={`Planned: ${planned.title}. ${planned.detail}`}
            accessibilityRole="summary"
            style={styles.group}
            testID="planned-card"
          >
            <StatusGroupRow
              detail={planned.detail}
              divided={planActions.length > 0}
              eyebrow="Planned"
              icon="calendar"
              title={planned.title}
              titleColor={warning.text}
              tone="warning"
            />
            {planActions.map((action) => (
              <ProfileListAction
                disabled={disabled}
                isLast
                key={action.key}
                label={action.label}
                onPress={action.onPress}
              />
            ))}
          </View>
        ) : null}
        {moreSheet}
      </View>
    );
  }

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
      {starts ? (
        <View
          accessibilityLabel={`First day: ${starts.title}. ${starts.detail}`}
          accessibilityRole="summary"
          style={[
            styles.card,
            styles.dashed,
            { backgroundColor: mobileColors.surface, borderColor: warning.border },
          ]}
          testID="starts-card"
        >
          <View style={styles.row}>
            <StatusIconCircle name="calendar" tone="warning" />
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>First day</Text>
              <Text style={[styles.title, { color: warning.text }]}>{starts.title}</Text>
              <Text style={styles.detail}>{starts.detail}</Text>
            </View>
          </View>
        </View>
      ) : null}
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
      {moreSheet}
    </View>
  );
}

/** One fact in a status group: its tinted icon, then what it is and since when. */
function StatusGroupRow({
  icon,
  tone,
  eyebrow,
  title,
  titleColor,
  detail,
  divided = false,
}: {
  icon: IconName;
  tone: StatusTone;
  eyebrow?: string;
  title: string;
  titleColor: string;
  detail?: string;
  divided?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  return (
    <View style={styles.groupRow}>
      <StatusIconCircle name={icon} tone={tone} />
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {divided ? <View style={styles.groupDivider} /> : null}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    stack: {
      gap: IS_NATIVE_LIST ? mobileSpace.lg : mobileSpace.sm,
    },
    group: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      overflow: "hidden",
      ...groupedCardEdge(mobileColors, isDark),
    },
    groupRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileSpace.md,
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: mobileSpace.md,
    },
    // Inset to the text, past the 32pt icon.
    groupDivider: {
      backgroundColor: mobileColors.borderSubtle,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      left: 16 + 32 + mobileSpace.md,
      position: "absolute",
      right: 0,
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
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.textSecondary,
    },
    title: {
      ...mobileTextWeighted("body", "semibold"),
      ...mobileTabularText,
    },
    detail: {
      ...mobileText.meta,
      ...mobileTabularText,
      color: mobileColors.textSecondary,
    },
  });
