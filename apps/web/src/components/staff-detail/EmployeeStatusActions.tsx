"use client";

import { useRef, useState } from "react";
import type { AbsenceType, Employee } from "@/types";
import { Button } from "@/components/Button";
import { addDays, formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import ConfirmDialog, { ConfirmSummaryBox } from "@/components/ConfirmDialog";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import CalendarDatePicker from "@/components/ui/calendar-date-picker";
import CustomSelect from "@/components/CustomSelect";
import { RadioCardList } from "@/components/ui/radio-card-list";
import type { PlannedChange, SuspensionDates } from "@/features/employees/client";
import { CalendarDays, CalendarX2, Ellipsis, Undo2 } from "lucide-react";
import { STATUS_ACTION_ICONS, STATUS_CHANGE_ICON } from "@/components/staff/status-action-icons";
import {
  AWAY_ABSENCE_NEEDS_DATE_MESSAGE,
  describeStatusAction,
  describeStatusCard,
  PLANNED_START_MAX_DAYS,
  plannedLastDay,
  plannedReturn,
  availableStatusChoices,
  statusChoices,
  suggestedStatusChoice,
  type StatusAction,
  type StatusCardCopy,
} from "@dubgrid/domain";
import { STATUS_KIND_ICONS, STATUS_TONE_COLORS, StatusIconCircle } from "./StatusMarkIcon";

export interface EmployeeStatusActionsProps {
  employee: Employee;
  canEdit: boolean;
  /** When true, this employee is the current user — destructive self-actions are hidden. */
  isSelf?: boolean;
  /**
   * False when this manager may not offboard or restore them (51k,
   * `canOffboardAtTier`): both stay listed, disabled with the reason.
   */
  canOffboard?: boolean;
  onDeactivate: (
    empId: string,
    note?: string,
    returnDate?: string,
    absenceTypeId?: number | null,
    startDate?: string,
  ) => void | Promise<unknown>;
  /** Restores or marks them active now, or with `startDate` (51l) restores them on that day. */
  onActivate: (empId: string, startDate?: string) => void | Promise<unknown>;
  /**
   * Sets, moves or clears (null) an Away person's return date and the absence
   * their days hold; hidden when absent.
   */
  onSetReturnDate?: (
    empId: string,
    returnDate: string | null,
    absenceTypeId?: number | null,
  ) => void | Promise<unknown>;
  /** Gives a suspended person their access back (51c); not offered when absent. */
  onReinstate?: (empId: string) => void | Promise<unknown>;
  /**
   * Suspends someone's access (51c), from a later start or until an end date
   * when given (51g3); not offered when absent.
   */
  onSuspend?: (empId: string, dates?: SuspensionDates) => void | Promise<unknown>;
  /** Sets, moves or clears (null) a suspended person's end date (51g3); hidden when absent. */
  onSetSuspendedUntil?: (empId: string, until: string | null) => void | Promise<unknown>;
  /**
   * Moves or changes a planned Away (51g1), last day (51g2) or return (51l),
   * or cancels it (null); not offered when absent.
   */
  onSetPlannedChange?: (empId: string, plan: PlannedChange | null) => void | Promise<unknown>;
  /** Live absence types; with a return date, one can fill the away days (51f). */
  absenceTypes?: readonly AbsenceType[];
  /** Offboards them now, or with `lastDay` the day after it (51g2). */
  onRemove: (empId: string, note?: string, lastDay?: string) => void | Promise<unknown>;
  variant: "panel" | "page" | "card" | "card-quiet";
  /** The button's label; Edit plan opens the same dialog from the planned card. */
  label?: string;
  /** Opens a confirmation for this change alone, as the card's Reinstate does. */
  initialChoice?: StatusAction;
  /** Left out of the list because a button beside this one already offers it. */
  excludeChoice?: StatusAction;
  /**
   * For someone with an away planned: Edit plan opens its dates alone, and
   * Change status the list alone, so the two never offer the same thing.
   */
  focus?: "plan" | "status";
  /**
   * Opens the dialog at once with no button of its own, for a menu item that
   * names its change; `onClosed` lets the menu's owner unmount it.
   */
  startOpen?: boolean;
  onClosed?: () => void;
  /** Stretches the button to fill its container, for an equal-width row of actions. */
  fillWidth?: boolean;
  /** Hides the confirmation while a step-up prompt asks for fresh proof. */
  stepUpOpen?: boolean;
}

const RETURN_DATE_HINT = "Leave it empty to mark them active yourself.";

function ReturnDateField({
  value,
  minDate,
  onChange,
}: {
  value: string;
  minDate: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Return date
      </span>
      <CalendarDatePicker
        value={value}
        onChange={onChange}
        label="Return date"
        placeholder="No return date"
        minDate={minDate}
        allowClear
      />
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {RETURN_DATE_HINT}
      </span>
    </div>
  );
}

/** The first day away; empty means today, and a later day plans it (51g1). */
function StartDateField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Starts
      </span>
      <CalendarDatePicker
        value={value}
        onChange={onChange}
        label="Starts"
        placeholder="Today"
        minDate={formatDateKey(new Date())}
        maxDate={formatDateKey(addDays(new Date(), PLANNED_START_MAX_DAYS))}
        allowClear
      />
      {hint ? (
        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Their last day; empty offboards them now, a day plans it for the day after (51g2). */
function LastDayField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Last day
      </span>
      <CalendarDatePicker
        value={value}
        onChange={onChange}
        label="Last day"
        placeholder="Offboard now"
        minDate={formatDateKey(new Date())}
        maxDate={formatDateKey(addDays(new Date(), PLANNED_START_MAX_DAYS))}
        allowClear
      />
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {hint}
      </span>
    </div>
  );
}

const SUSPENSION_END_HINT = "Leave it empty to reinstate them yourself.";

/** A suspension's end, the first day they have access again (51g3); empty for none. */
function SuspensionEndField({
  value,
  minDate,
  onChange,
}: {
  value: string;
  minDate: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Ends
      </span>
      <CalendarDatePicker
        value={value}
        onChange={onChange}
        label="Ends"
        placeholder="No end date"
        minDate={minDate}
        allowClear
      />
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {SUSPENSION_END_HINT}
      </span>
    </div>
  );
}

const LAST_DAY_HINT = "Leave it empty to offboard them now.";

const NO_ABSENCE = 0;

const AWAY_ABSENCE_HINT = "Choose No absence to leave those days empty.";

function AwayAbsenceField({
  value,
  absenceTypes,
  onChange,
  disabled = false,
}: {
  value: number;
  absenceTypes: readonly AbsenceType[];
  onChange: (value: number) => void;
  /** Until there's a return date: the absence fills the days up to it. */
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-label)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Absence
      </span>
      <CustomSelect
        ariaLabel="Absence"
        disabled={disabled}
        value={value}
        options={[
          { value: NO_ABSENCE, label: "No absence" },
          ...absenceTypes.map((absenceType) => ({
            value: absenceType.id,
            label: absenceType.name,
          })),
        ]}
        onChange={onChange}
      />
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {disabled ? AWAY_ABSENCE_NEEDS_DATE_MESSAGE : AWAY_ABSENCE_HINT}
      </span>
    </div>
  );
}

/** The tint of the status each choice leads to. */
const CHOICE_TONES = {
  active: "success",
  away: "warning",
  suspended: "danger",
  archived: "neutral",
} as const;

const NOTE_PLACEHOLDERS: Partial<Record<StatusAction, string>> = {
  markAway: "Reason (optional) - e.g. Family leave",
  archive: "Reason (optional) - e.g. Left the company",
};

const LABEL_STYLE = {
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 600,
  color: "var(--dg-color-text-secondary)",
} as const;

/** Cancels a planned change, or takes the cancel back, inside the plan's dialog. */
function PlanCancelToggle({
  cancelling,
  cancelLabel,
  keepLabel,
  onToggle,
}: {
  cancelling: boolean;
  cancelLabel: string;
  keepLabel: string;
  onToggle: () => void;
}) {
  const Icon = cancelling ? Undo2 : CalendarX2;
  return (
    <Button
      className="dg-btn dg-btn-secondary dg-btn-sm"
      style={{ alignSelf: "flex-start" }}
      onClick={onToggle}
    >
      <Icon size={14} aria-hidden />
      {cancelling ? keepLabel : cancelLabel}
    </Button>
  );
}

/** Where they stand, above the Change status list: the profile's status card, without its tint. */
function CurrentStatusCard({ card }: { card: StatusCardCopy }) {
  const { current, planned } = card;
  const titleColor =
    current.kind === "active"
      ? "var(--dg-color-text-primary)"
      : STATUS_TONE_COLORS[current.tone].text;
  return (
    <div role="status" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--dg-radius-lg)",
          border: "1px solid var(--dg-color-border)",
          background: "var(--dg-color-surface)",
        }}
      >
        <StatusIconCircle icon={STATUS_KIND_ICONS[current.kind]} tone={current.tone} size={30} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span
            className="dg-tabular-nums"
            style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: titleColor }}
          >
            {current.title}
          </span>
          <span
            className="dg-tabular-nums"
            style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}
          >
            {current.detail}
          </span>
        </span>
      </div>
      {planned ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderRadius: "var(--dg-radius-lg)",
            border: `1px dashed ${STATUS_TONE_COLORS.warning.border}`,
          }}
        >
          <StatusIconCircle icon={CalendarDays} tone="warning" size={26} />
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span
              className="dg-tabular-nums"
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                color: STATUS_TONE_COLORS.warning.text,
              }}
            >
              {`Planned: ${planned.title}`}
            </span>
            <span
              className="dg-tabular-nums"
              style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}
            >
              {planned.detail}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Every status change goes through one Change status button and one dialog
 * (51d): a card at the top says where they stand, the list holds every other
 * status (one they can't move to now is disabled and says why), the title and
 * confirm button name what happens, and what changes is kept apart from what
 * stays the same. Opened from a button that names its change, there is no
 * list, only a sentence saying what it does.
 */
export function EmployeeStatusActions({
  employee,
  canEdit,
  isSelf = false,
  canOffboard = true,
  onDeactivate,
  onActivate,
  onRemove,
  onSetReturnDate,
  onReinstate,
  onSuspend,
  onSetSuspendedUntil,
  onSetPlannedChange,
  absenceTypes = [],
  variant,
  label = "Change status",
  initialChoice,
  excludeChoice,
  focus,
  startOpen = false,
  onClosed,
  fillWidth = false,
  stepUpOpen = false,
}: EmployeeStatusActionsProps) {
  const hasPlan =
    employee.status === "active" && employee.plannedStatus === "away" && !!employee.plannedFrom;
  // A last day planned ahead (51g2) is edited here like a planned Away.
  const plannedLeave = employee.status === "active" ? plannedLastDay(employee) : null;
  const initialLastDay = plannedLeave ?? "";
  // Someone Away edits their return date here; someone with an Away planned
  // edits the plan's dates (51g1). Both start from what they have.
  const initialReturnDate = (hasPlan ? employee.plannedUntil : employee.awayUntil) ?? "";
  const initialAbsenceTypeId =
    (hasPlan ? employee.plannedAbsenceTypeId : employee.awayAbsenceTypeId) ?? NO_ABSENCE;
  // A suspension's end sits beside it (51g3); a planned one's dates are its plan's.
  const isSuspended =
    employee.status === "active" && !employee.archivedAt && Boolean(employee.suspendedAt);
  const hasSuspensionPlan =
    employee.status === "active" &&
    employee.plannedStatus === "suspended" &&
    !!employee.plannedFrom;
  const initialUntil =
    (isSuspended ? employee.suspendedUntil : hasSuspensionPlan ? employee.plannedUntil : null) ??
    "";
  // An Offboarded person's planned return (51l) is edited here too.
  const returnDay = employee.status === "removed" ? plannedReturn(employee) : null;
  const initialStartDate =
    hasPlan || hasSuspensionPlan ? (employee.plannedFrom ?? "") : (returnDay ?? "");
  const [open, setOpen] = useState(startOpen);
  const [choice, setChoice] = useState<StatusAction | null>(
    startOpen ? (initialChoice ?? null) : null,
  );
  const [note, setNote] = useState("");
  const [returnDate, setReturnDate] = useState(initialReturnDate);
  const [absenceTypeId, setAbsenceTypeId] = useState(initialAbsenceTypeId);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [lastDay, setLastDay] = useState(initialLastDay);
  const [until, setUntil] = useState(initialUntil);
  const [cancellingPlan, setCancellingPlan] = useState(false);
  // The dialog unmounts while a step-up prompt shows, which drops its own
  // latch, so the pending state lives here to survive the round trip.
  const [pending, setPending] = useState(false);

  // Self-action guard: you can't change your own status, so callers hide this
  // whole section rather than show it with nothing actionable inside.
  if (!canEdit || isSelf) return null;

  const displayName = getEmployeeDisplayName(employee);
  const isAway = employee.status === "inactive" && !employee.archivedAt;
  const handlers: Partial<Record<StatusAction, unknown>> = {
    suspend: onSuspend,
    reinstate: onReinstate,
  };
  const todayKey = formatDateKey(new Date());
  // A start after today plans the Away rather than starting it.
  const laterStart = startDate && startDate > todayKey ? startDate : null;
  const returnMinDate = formatDateKey(
    addDays(laterStart ? new Date(`${laterStart}T00:00:00`) : new Date(), 1),
  );
  const suspensionEndChanged =
    isSuspended && !choice && (until || null) !== (employee.suspendedUntil ?? null);
  const suspensionPlanChanged =
    hasSuspensionPlan &&
    !cancellingPlan &&
    !!laterStart &&
    (laterStart !== employee.plannedFrom || (until || null) !== (employee.plannedUntil ?? null));
  // Clearing a planned suspension's start date suspends them today instead.
  const suspendsNow = hasSuspensionPlan && !cancellingPlan && !startDate && focus !== "status";
  const returnPlanChanged =
    !!returnDay && !cancellingPlan && !!laterStart && laterStart !== returnDay;
  // Clearing a planned return's date restores them today instead.
  const restoresNow = !!returnDay && !cancellingPlan && !laterStart && focus !== "status";
  // Every other status is listed, an unavailable one disabled with its reason;
  // only a change this surface has no handler for is left out.
  const choices = statusChoices(employee, { canOffboard }).filter(
    (option) =>
      option.action !== excludeChoice &&
      (!(option.action in handlers) || Boolean(handlers[option.action])),
  );
  // A button that names its own change (Reinstate, Restore, Offboard) opens a
  // confirmation for that change alone. Change status always opens the list.
  const onlyChoice =
    focus === "plan" || !initialChoice
      ? null
      : (choices.find((option) => option.available && option.action === initialChoice) ?? null);

  // The absence only applies with a return date, so it goes when the date does.
  const chosenAbsenceTypeId = returnDate && absenceTypeId !== NO_ABSENCE ? absenceTypeId : null;
  const chosenAbsenceName =
    absenceTypes.find((absenceType) => absenceType.id === chosenAbsenceTypeId)?.name ?? null;
  const awayDetailsChanged =
    isAway &&
    ((returnDate || null) !== (employee.awayUntil ?? null) ||
      chosenAbsenceTypeId !== (employee.awayAbsenceTypeId ?? null));
  const planChanged =
    hasPlan &&
    !cancellingPlan &&
    !!laterStart &&
    (laterStart !== employee.plannedFrom ||
      (returnDate || null) !== (employee.plannedUntil ?? null) ||
      chosenAbsenceTypeId !== (employee.plannedAbsenceTypeId ?? null));
  // Clearing a planned away's start date starts it today instead.
  const startsNow = hasPlan && !cancellingPlan && !startDate && focus !== "status";
  const plannedAbsenceName =
    absenceTypes.find((absenceType) => absenceType.id === employee.plannedAbsenceTypeId)?.name ??
    null;
  // A last day can be set only for someone Active and not suspended, as a plan needs.
  const canPlanLastDay =
    employee.status === "active" && !employee.archivedAt && !employee.suspendedAt;
  const lastDayChanged = !!plannedLeave && !cancellingPlan && !!lastDay && lastDay !== plannedLeave;
  // Clearing a planned last day offboards them today instead.
  const offboardsNow = !!plannedLeave && !cancellingPlan && !lastDay && focus !== "status";
  const statusCard = describeStatusCard(employee, {
    absenceName: isAway
      ? absenceTypes.find((absenceType) => absenceType.id === employee.awayAbsenceTypeId)?.name
      : plannedAbsenceName,
  });
  const datedFields = (
    <>
      <ReturnDateField value={returnDate} minDate={returnMinDate} onChange={setReturnDate} />
      {absenceTypes.length > 0 ? (
        <AwayAbsenceField
          value={chosenAbsenceTypeId ?? NO_ABSENCE}
          absenceTypes={absenceTypes}
          onChange={setAbsenceTypeId}
          disabled={!returnDate}
        />
      ) : null}
    </>
  );

  function reset() {
    setChoice(onlyChoice?.action ?? null);
    setNote("");
    setReturnDate(initialReturnDate);
    setAbsenceTypeId(initialAbsenceTypeId);
    setStartDate(initialStartDate);
    setLastDay(initialLastDay);
    setUntil(initialUntil);
    setCancellingPlan(false);
  }

  function close() {
    setOpen(false);
    reset();
    onClosed?.();
  }

  async function confirm() {
    const trimmedNote = note.trim() || undefined;
    setPending(true);
    try {
      switch (choice) {
        case null:
          if (returnDay) {
            await (restoresNow
              ? onActivate(employee.id)
              : onSetPlannedChange?.(
                  employee.id,
                  cancellingPlan || !laterStart
                    ? null
                    : { startDate: laterStart, returnDate: null, absenceTypeId: null },
                ));
          } else if (plannedLeave) {
            await (offboardsNow
              ? onRemove(employee.id)
              : onSetPlannedChange?.(employee.id, cancellingPlan ? null : { lastDay }));
          } else if (hasSuspensionPlan) {
            await (suspendsNow
              ? onSuspend?.(employee.id, { until: until || null })
              : onSetPlannedChange?.(
                  employee.id,
                  cancellingPlan || !laterStart
                    ? null
                    : { startDate: laterStart, returnDate: until || null, absenceTypeId: null },
                ));
          } else if (isSuspended) {
            await onSetSuspendedUntil?.(employee.id, until || null);
          } else if (startsNow) {
            await (returnDate
              ? onDeactivate(employee.id, undefined, returnDate, chosenAbsenceTypeId)
              : onDeactivate(employee.id));
          } else if (hasPlan) {
            await onSetPlannedChange?.(
              employee.id,
              cancellingPlan || !laterStart
                ? null
                : {
                    startDate: laterStart,
                    returnDate: returnDate || null,
                    absenceTypeId: chosenAbsenceTypeId,
                  },
            );
          } else {
            await onSetReturnDate?.(employee.id, returnDate || null, chosenAbsenceTypeId);
          }
          break;
        case "markAway":
          await (laterStart
            ? onDeactivate(
                employee.id,
                trimmedNote,
                returnDate || undefined,
                chosenAbsenceTypeId,
                laterStart,
              )
            : returnDate
              ? onDeactivate(employee.id, trimmedNote, returnDate, chosenAbsenceTypeId)
              : onDeactivate(employee.id, trimmedNote));
          break;
        // Revoking any linked org membership happens server-side, atomically
        // with the status change (see /api/employees/status).
        case "archive":
          await (canPlanLastDay && lastDay
            ? onRemove(employee.id, trimmedNote, lastDay)
            : onRemove(employee.id, trimmedNote));
          break;
        case "suspend":
          await onSuspend?.(employee.id, { startDate: laterStart, until: until || null });
          break;
        case "reinstate":
          await onReinstate?.(employee.id);
          break;
        case "restore":
          await (laterStart ? onActivate(employee.id, laterStart) : onActivate(employee.id));
          break;
        default:
          await onActivate(employee.id);
      }
    } finally {
      setPending(false);
    }
    close();
  }

  const copy = choice
    ? describeStatusAction(choice, displayName, {
        hasAccount: Boolean(employee.userId),
        returnDate:
          choice === "markAway" ? returnDate || null : choice === "suspend" ? until || null : null,
        absenceName: choice === "markAway" ? chosenAbsenceName : null,
        startDate:
          choice === "markAway" || choice === "suspend" || choice === "restore" ? laterStart : null,
        lastDay: choice === "archive" && canPlanLastDay ? lastDay || null : null,
        // Any other change replaces the plan, and says so.
        plannedFrom:
          plannedLeave || hasSuspensionPlan || (hasPlan && !(choice === "markAway" && laterStart))
            ? employee.plannedFrom
            : null,
        plannedStatus: employee.plannedStatus ?? null,
      })
    : restoresNow
      ? describeStatusAction("restore", displayName)
      : returnDay && cancellingPlan
        ? describeStatusAction("cancelPlannedChange", displayName, { plannedStatus: "active" })
        : returnPlanChanged
          ? describeStatusAction("setPlannedChange", displayName, {
              plannedStatus: "active",
              startDate: laterStart,
              hasAccount: Boolean(employee.userId),
            })
          : suspendsNow
            ? describeStatusAction("suspend", displayName, { returnDate: until || null })
            : hasSuspensionPlan && cancellingPlan
              ? describeStatusAction("cancelPlannedChange", displayName, {
                  plannedStatus: "suspended",
                })
              : suspensionPlanChanged
                ? describeStatusAction("setPlannedChange", displayName, {
                    plannedStatus: "suspended",
                    startDate: laterStart,
                    returnDate: until || null,
                  })
                : suspensionEndChanged
                  ? describeStatusAction("setSuspendedUntil", displayName, {
                      returnDate: until || null,
                      currentReturnDate: employee.suspendedUntil ?? null,
                    })
                  : offboardsNow
                    ? describeStatusAction("archive", displayName, {
                        hasAccount: Boolean(employee.userId),
                      })
                    : plannedLeave && cancellingPlan
                      ? describeStatusAction("cancelPlannedChange", displayName, {
                          plannedStatus: "removed",
                        })
                      : lastDayChanged
                        ? describeStatusAction("setPlannedChange", displayName, {
                            plannedStatus: "removed",
                            lastDay,
                            hasAccount: Boolean(employee.userId),
                          })
                        : startsNow
                          ? describeStatusAction("markAway", displayName, {
                              hasAccount: Boolean(employee.userId),
                              returnDate: returnDate || null,
                              absenceName: chosenAbsenceName,
                            })
                          : cancellingPlan
                            ? describeStatusAction("cancelPlannedChange", displayName, {
                                absenceName: plannedAbsenceName,
                              })
                            : planChanged
                              ? describeStatusAction("setPlannedChange", displayName, {
                                  startDate: laterStart,
                                  returnDate: returnDate || null,
                                  absenceName: chosenAbsenceName,
                                })
                              : awayDetailsChanged
                                ? describeStatusAction("setReturnDate", displayName, {
                                    returnDate: returnDate || null,
                                    currentReturnDate: employee.awayUntil ?? null,
                                    absenceName: chosenAbsenceName,
                                  })
                                : null;
  const notePlaceholder = choice ? NOTE_PLACEHOLDERS[choice] : undefined;

  const untilMinDate = returnMinDate;
  const detailsAboveLine = (
    <>
      {isAway && !choice && onSetReturnDate ? datedFields : null}
      {isSuspended && !choice && onSetSuspendedUntil ? (
        <SuspensionEndField value={until} minDate={untilMinDate} onChange={setUntil} />
      ) : null}
      {hasSuspensionPlan && !choice && onSetPlannedChange && focus !== "status" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cancellingPlan ? null : (
            <>
              <StartDateField
                value={startDate}
                onChange={setStartDate}
                hint="Clear it to suspend them today."
              />
              <SuspensionEndField value={until} minDate={untilMinDate} onChange={setUntil} />
            </>
          )}
          <PlanCancelToggle
            cancelling={cancellingPlan}
            cancelLabel="Cancel planned suspension"
            keepLabel="Keep planned suspension"
            onToggle={() => setCancellingPlan((value) => !value)}
          />
        </div>
      ) : null}
      {returnDay && !choice && onSetPlannedChange && focus !== "status" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cancellingPlan ? null : (
            <StartDateField
              value={startDate}
              onChange={setStartDate}
              hint="Clear it to restore them today."
            />
          )}
          <PlanCancelToggle
            cancelling={cancellingPlan}
            cancelLabel="Cancel planned return"
            keepLabel="Keep planned return"
            onToggle={() => setCancellingPlan((value) => !value)}
          />
        </div>
      ) : null}
      {plannedLeave && !choice && onSetPlannedChange && focus !== "status" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cancellingPlan ? null : (
            <LastDayField
              value={lastDay}
              onChange={setLastDay}
              hint="Clear it to offboard them today."
            />
          )}
          <PlanCancelToggle
            cancelling={cancellingPlan}
            cancelLabel="Cancel last day"
            keepLabel="Keep last day"
            onToggle={() => setCancellingPlan((value) => !value)}
          />
        </div>
      ) : null}
      {hasPlan && !choice && onSetPlannedChange && focus !== "status" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cancellingPlan ? null : (
            <>
              <StartDateField
                value={startDate}
                onChange={setStartDate}
                hint="Clear it to start their time away today."
              />
              {datedFields}
            </>
          )}
          <PlanCancelToggle
            cancelling={cancellingPlan}
            cancelLabel="Cancel planned time away"
            keepLabel="Keep planned time away"
            onToggle={() => setCancellingPlan((value) => !value)}
          />
        </div>
      ) : null}
    </>
  );
  const ordinary = choice === "markActive" || choice === "reinstate" || choice === "restore";
  const showList = !onlyChoice && focus !== "plan";

  const dialog =
    open && !stepUpOpen ? (
      <ConfirmDialog
        icon={
          offboardsNow
            ? STATUS_ACTION_ICONS.archive
            : choice
              ? STATUS_ACTION_ICONS[choice]
              : STATUS_CHANGE_ICON
        }
        isLoading={pending}
        // Wider than a plain confirm: the status cards carry a line of detail each.
        maxWidth={540}
        title={
          copy?.title ??
          (focus === "plan"
            ? isAway
              ? `Change ${displayName}'s time away?`
              : isSuspended
                ? `Change when ${displayName}'s suspension ends?`
                : returnDay
                  ? `Change ${displayName}'s planned return?`
                  : hasSuspensionPlan
                    ? `Change ${displayName}'s planned suspension?`
                    : plannedLeave
                      ? `Change ${displayName}'s last day?`
                      : `Change ${displayName}'s planned time away?`
            : `Change ${displayName}'s status?`)
        }
        message={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {showList ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  paddingBottom: 16,
                  borderBottom: "1px solid var(--dg-color-border)",
                }}
              >
                <CurrentStatusCard card={statusCard} />
                {detailsAboveLine}
              </div>
            ) : (
              // A confirmation names its change in the title, so it skips where they stand.
              detailsAboveLine
            )}
            {onlyChoice ? (
              <span style={{ color: "var(--dg-color-text-primary)" }}>{onlyChoice.outcome}</span>
            ) : !showList ? null : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={LABEL_STYLE}>Change to</span>
                <RadioCardList
                  label="Change to"
                  options={choices.map((option) => ({
                    value: option.action,
                    label: option.label,
                    detail: option.unavailableReason ?? option.detail,
                    disabled: !option.available,
                    icon: (
                      <StatusIconCircle
                        icon={STATUS_KIND_ICONS[option.kind]}
                        tone={CHOICE_TONES[option.kind]}
                        size={30}
                      />
                    ),
                  }))}
                  value={choice}
                  onChange={(next) => {
                    setChoice(next);
                    setCancellingPlan(false);
                    // A plan's dates fill these for Edit plan; a new choice starts clear.
                    setStartDate("");
                    setUntil("");
                  }}
                />
              </div>
            )}
            {notePlaceholder ? (
              <input
                className="dg-input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={notePlaceholder}
                aria-label="Reason (optional)"
                style={{ fontSize: "var(--dg-fs-label)", width: "100%" }}
              />
            ) : null}
            {choice === "markAway" ? (
              <>
                <StartDateField value={startDate} onChange={setStartDate} />
                {datedFields}
              </>
            ) : null}
            {choice === "suspend" ? (
              <>
                {onSetPlannedChange ? (
                  <StartDateField value={startDate} onChange={setStartDate} />
                ) : null}
                <SuspensionEndField value={until} minDate={untilMinDate} onChange={setUntil} />
              </>
            ) : null}
            {choice === "restore" && onSetPlannedChange ? (
              <StartDateField
                value={startDate}
                onChange={setStartDate}
                hint="Leave it empty to restore them today."
              />
            ) : null}
            {choice === "archive" && canPlanLastDay && onSetPlannedChange ? (
              <LastDayField value={lastDay} onChange={setLastDay} hint={LAST_DAY_HINT} />
            ) : null}
            {copy?.message ? <span>{copy.message}</span> : null}
            {copy && copy.points.length > 0 ? (
              <ConfirmSummaryBox summary={{ title: "Changes", points: copy.points }} />
            ) : null}
            {copy && copy.unchanged.length > 0 ? (
              <ConfirmSummaryBox summary={{ title: "Stays the same", points: copy.unchanged }} />
            ) : null}
          </div>
        }
        confirmLabel={
          choice || cancellingPlan || startsNow || offboardsNow || suspendsNow || restoresNow
            ? (copy?.label ?? "")
            : (isAway && onSetReturnDate) ||
                (isSuspended && onSetSuspendedUntil) ||
                ((hasPlan || plannedLeave || hasSuspensionPlan || returnDay) &&
                  onSetPlannedChange &&
                  focus !== "status")
              ? "Save changes"
              : "Change status"
        }
        confirmDisabled={
          !choice &&
          !awayDetailsChanged &&
          !planChanged &&
          !lastDayChanged &&
          !suspensionEndChanged &&
          !suspensionPlanChanged &&
          !returnPlanChanged &&
          !restoresNow &&
          !cancellingPlan &&
          !startsNow &&
          !offboardsNow &&
          !suspendsNow
        }
        variant={
          choice === "archive" || offboardsNow
            ? "danger"
            : ordinary || (returnDay && !cancellingPlan)
              ? "info"
              : "warning"
        }
        onConfirm={confirm}
        onCancel={close}
      />
    ) : null;

  if (startOpen) return dialog;

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={
          variant === "page"
            ? "dg-btn dg-btn-secondary"
            : variant === "card"
              ? "dg-btn dg-btn-secondary dg-btn-sm"
              : variant === "card-quiet"
                ? "dg-btn dg-btn-ghost dg-btn-sm"
                : "dg-btn dg-btn-ghost dg-btn-xs"
        }
        style={fillWidth ? { width: "100%", minWidth: 0 } : undefined}
      >
        {label}
      </Button>
      {dialog}
    </>
  );
}

/**
 * The status card's buttons: the change most people want next (Reinstate,
 * Mark active, Restore) as a button, and a menu naming each other change
 * that can be made now (Mark away, Offboard, and for someone Away, Change
 * return date). Every one opens a confirmation for that change alone. Active
 * people get Change status, or a button named for the one change left.
 */
export function StatusCardActions(
  props: Omit<
    EmployeeStatusActionsProps,
    "variant" | "label" | "initialChoice" | "excludeChoice" | "focus" | "startOpen" | "onClosed"
  >,
) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [opening, setOpening] = useState<MenuOpening | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Only changes this surface can make: one without a Reinstate handler offers no Reinstate.
  const offered = (action: StatusAction) =>
    (action !== "reinstate" || Boolean(props.onReinstate)) &&
    (action !== "suspend" || Boolean(props.onSuspend));
  const reach = { canOffboard: props.canOffboard ?? true };
  const likely = suggestedStatusChoice(props.employee, reach);
  const suggested = likely && offered(likely.action) ? likely : null;
  const available = availableStatusChoices(props.employee, reach).filter((option) =>
    offered(option.action),
  );
  if (!suggested) {
    // One change left is the button's name; with none, the planned card's Edit plan is the way in.
    if (available.length === 0) return null;
    if (available.length === 1) {
      const [only] = available;
      return (
        <EmployeeStatusActions
          {...props}
          variant="card"
          label={describeStatusAction(only.action, "").label}
          initialChoice={only.action}
        />
      );
    }
    return <EmployeeStatusActions {...props} variant="card" focus="status" />;
  }
  const rest = available.filter((option) => option.action !== suggested.action);
  const away = props.employee.status === "inactive" && !props.employee.archivedAt;
  const suspended =
    props.employee.status === "active" &&
    !props.employee.archivedAt &&
    Boolean(props.employee.suspendedAt);
  const items: { key: string; label: string; open: MenuOpening }[] = [
    ...(suspended && props.onSetSuspendedUntil
      ? [
          {
            key: "details",
            label: describeStatusAction("setSuspendedUntil", "", {
              currentReturnDate: props.employee.suspendedUntil ?? null,
              returnDate: props.employee.suspendedUntil ?? null,
            }).label,
            open: { details: true },
          },
        ]
      : []),
    ...(away && props.onSetReturnDate
      ? [
          {
            key: "details",
            label: describeStatusAction("setReturnDate", "", {
              currentReturnDate: props.employee.awayUntil ?? null,
              returnDate: props.employee.awayUntil ?? null,
            }).label,
            open: { details: true },
          },
        ]
      : []),
    ...rest.map((option) => ({
      key: option.action,
      label: describeStatusAction(option.action, "").label,
      open: { choice: option.action },
    })),
  ];
  return (
    <div className="flex items-center justify-end gap-1">
      <EmployeeStatusActions
        {...props}
        variant="card"
        label={describeStatusAction(suggested.action, "").label}
        initialChoice={suggested.action}
      />
      {items.length > 0 ? (
        <>
          <Button
            ref={triggerRef}
            aria-label="More status changes"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="dg-btn dg-btn-secondary dg-btn-sm"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Ellipsis aria-hidden="true" size={16} />
          </Button>
          {menuOpen ? (
            <Menu
              open
              onOpenChange={(next) => {
                if (!next) setMenuOpen(false);
              }}
            >
              <MenuContent
                anchor={triggerRef}
                side="bottom"
                align="end"
                sideOffset={6}
                positionMethod="fixed"
                collisionPadding={8}
                finalFocus={triggerRef}
                style={{ minWidth: 180 }}
              >
                {items.map((item) => (
                  <MenuItem
                    key={item.key}
                    onClick={() => {
                      setMenuOpen(false);
                      setOpening(item.open);
                    }}
                  >
                    {item.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
        </>
      ) : null}
      {opening ? (
        // Mounted outside the menu, which unmounts as soon as an item is picked.
        <EmployeeStatusActions
          {...props}
          variant="card"
          startOpen
          initialChoice={opening.choice}
          focus={opening.details ? "plan" : undefined}
          onClosed={() => setOpening(null)}
        />
      ) : null}
    </div>
  );
}

/** What a card menu item opens: one change, or an Away person's return date or a suspension's end. */
interface MenuOpening {
  choice?: StatusAction;
  details?: boolean;
}
