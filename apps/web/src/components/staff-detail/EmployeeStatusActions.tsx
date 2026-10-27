"use client";

import { useState } from "react";
import type { AbsenceType, Employee } from "@/types";
import { Button } from "@/components/Button";
import { addDays, formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";
import CalendarDatePicker from "@/components/ui/calendar-date-picker";
import CustomSelect from "@/components/CustomSelect";
import { RadioCardList } from "@/components/ui/radio-card-list";
import {
  describeCurrentStatus,
  describeStatusAction,
  statusChoices,
  type StatusAction,
  type StatusTone,
} from "@dubgrid/domain";

export interface EmployeeStatusActionsProps {
  employee: Employee;
  canEdit: boolean;
  /** When true, this employee is the current user — destructive self-actions are hidden. */
  isSelf?: boolean;
  onDeactivate: (
    empId: string,
    note?: string,
    returnDate?: string,
    absenceTypeId?: number | null,
  ) => void | Promise<unknown>;
  onActivate: (empId: string) => void | Promise<unknown>;
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
  /** Suspends someone's access (51c); not offered when absent. */
  onSuspend?: (empId: string) => void | Promise<unknown>;
  /** Live absence types; with a return date, one can fill the away days (51f). */
  absenceTypes?: readonly AbsenceType[];
  onRemove: (empId: string, note?: string) => void | Promise<unknown>;
  variant: "panel" | "page";
  /** Stretches the button to fill its container, for an equal-width row of actions. */
  fillWidth?: boolean;
  /** Hides the confirmation while a step-up prompt asks for fresh proof. */
  stepUpOpen?: boolean;
}

const RETURN_DATE_HINT =
  "They're back to Active on this day. Leave it empty to mark them active yourself.";

function ReturnDateField({
  value,
  onChange,
}: {
  value: string;
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
        minDate={formatDateKey(addDays(new Date(), 1))}
        allowClear
      />
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
        {RETURN_DATE_HINT}
      </span>
    </div>
  );
}

const NO_ABSENCE = 0;

const AWAY_ABSENCE_HINT =
  "Every day until they're back shows this absence in the draft. Leave it as No absence to keep those days empty.";

function AwayAbsenceField({
  value,
  absenceTypes,
  onChange,
}: {
  value: number;
  absenceTypes: readonly AbsenceType[];
  onChange: (value: number) => void;
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
        {AWAY_ABSENCE_HINT}
      </span>
    </div>
  );
}

const NOTE_PLACEHOLDERS: Partial<Record<StatusAction, string>> = {
  markAway: "Reason (optional) - e.g. Family leave",
  archive: "Reason (optional) - e.g. Left the company",
};

const TONE_COLORS: Record<StatusTone, { bg: string; border: string; text: string }> = {
  success: {
    bg: "var(--dg-color-success-bg)",
    border: "var(--dg-color-success-border)",
    text: "var(--dg-color-success-text)",
  },
  warning: {
    bg: "var(--dg-color-warning-bg)",
    border: "var(--dg-color-warning-border)",
    text: "var(--dg-color-warning-text)",
  },
  danger: {
    bg: "var(--dg-color-danger-bg)",
    border: "var(--dg-color-danger-border)",
    text: "var(--dg-color-danger-text)",
  },
  neutral: {
    bg: "var(--dg-color-bg-secondary)",
    border: "var(--dg-color-border-light)",
    text: "var(--dg-color-text-secondary)",
  },
};

/** Where they stand, at the top of the dialog, tinted like their status pill. */
function CurrentStatusBox({
  text,
  detail,
  tone,
}: {
  text: string;
  detail: string;
  tone: StatusTone;
}) {
  const colors = TONE_COLORS[tone];
  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "10px 12px",
        borderRadius: "var(--dg-radius-lg)",
        border: `1px solid ${colors.border}`,
        background: colors.bg,
      }}
    >
      <span
        className="dg-tabular-nums"
        style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: colors.text }}
      >
        {text}
      </span>
      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}>
        {detail}
      </span>
    </div>
  );
}

/**
 * Every status change goes through one Change status button and one dialog
 * (51d): a box at the top, tinted like their pill, says where they stand, the list holds only
 * the statuses they can move to, and the confirm button names what happens.
 */
export function EmployeeStatusActions({
  employee,
  canEdit,
  isSelf = false,
  onDeactivate,
  onActivate,
  onRemove,
  onSetReturnDate,
  onReinstate,
  onSuspend,
  absenceTypes = [],
  variant,
  fillWidth = false,
  stepUpOpen = false,
}: EmployeeStatusActionsProps) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<StatusAction | null>(null);
  const [note, setNote] = useState("");
  const [returnDate, setReturnDate] = useState(employee.awayUntil ?? "");
  const [absenceTypeId, setAbsenceTypeId] = useState(employee.awayAbsenceTypeId ?? NO_ABSENCE);
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
  const choices = statusChoices(employee).filter(
    (option) => !(option.action in handlers) || Boolean(handlers[option.action]),
  );
  const current = describeCurrentStatus(employee);

  // The absence only applies with a return date, so it goes when the date does.
  const chosenAbsenceTypeId = returnDate && absenceTypeId !== NO_ABSENCE ? absenceTypeId : null;
  const chosenAbsenceName =
    absenceTypes.find((absenceType) => absenceType.id === chosenAbsenceTypeId)?.name ?? null;
  const awayDetailsChanged =
    isAway &&
    ((returnDate || null) !== (employee.awayUntil ?? null) ||
      chosenAbsenceTypeId !== (employee.awayAbsenceTypeId ?? null));
  const datedFields = (
    <>
      <ReturnDateField value={returnDate} onChange={setReturnDate} />
      {returnDate && absenceTypes.length > 0 ? (
        <AwayAbsenceField
          value={chosenAbsenceTypeId ?? NO_ABSENCE}
          absenceTypes={absenceTypes}
          onChange={setAbsenceTypeId}
        />
      ) : null}
    </>
  );

  function reset() {
    setChoice(null);
    setNote("");
    setReturnDate(employee.awayUntil ?? "");
    setAbsenceTypeId(employee.awayAbsenceTypeId ?? NO_ABSENCE);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function confirm() {
    const trimmedNote = note.trim() || undefined;
    setPending(true);
    try {
      switch (choice) {
        case null:
          await onSetReturnDate?.(employee.id, returnDate || null, chosenAbsenceTypeId);
          break;
        case "markAway":
          await (returnDate
            ? onDeactivate(employee.id, trimmedNote, returnDate, chosenAbsenceTypeId)
            : onDeactivate(employee.id, trimmedNote));
          break;
        // Revoking any linked org membership happens server-side, atomically
        // with the status change (see /api/employees/status).
        case "archive":
          await onRemove(employee.id, trimmedNote);
          break;
        case "suspend":
          await onSuspend?.(employee.id);
          break;
        case "reinstate":
          await onReinstate?.(employee.id);
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
        returnDate: choice === "markAway" ? returnDate || null : null,
        absenceName: choice === "markAway" ? chosenAbsenceName : null,
      })
    : awayDetailsChanged
      ? describeStatusAction("setReturnDate", displayName, {
          returnDate: returnDate || null,
          currentReturnDate: employee.awayUntil ?? null,
          absenceName: chosenAbsenceName,
        })
      : null;
  const notePlaceholder = choice ? NOTE_PLACEHOLDERS[choice] : undefined;

  const dialog =
    open && !stepUpOpen ? (
      <ConfirmDialog
        isLoading={pending}
        title={`Change ${displayName}'s status?`}
        message={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CurrentStatusBox text={current.text} detail={current.detail} tone={current.tone} />
            {isAway && !choice && onSetReturnDate ? datedFields : null}
            <RadioCardList
              label="Status"
              options={choices.map((option) => ({
                value: option.action,
                label: option.label,
                detail: option.detail,
              }))}
              value={choice}
              onChange={setChoice}
            />
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
            {choice === "markAway" ? datedFields : null}
            {copy?.message ? <span>{copy.message}</span> : null}
          </div>
        }
        summary={copy ? { points: copy.points } : undefined}
        confirmLabel={
          choice
            ? (copy?.label ?? "")
            : isAway && onSetReturnDate
              ? "Save changes"
              : "Change status"
        }
        confirmDisabled={!choice && !awayDetailsChanged}
        variant={choice === "archive" ? "danger" : "warning"}
        onConfirm={confirm}
        onCancel={close}
      />
    ) : null;

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={variant === "page" ? "dg-btn dg-btn-secondary" : "dg-btn dg-btn-ghost dg-btn-xs"}
        style={fillWidth ? { width: "100%", minWidth: 0 } : undefined}
      >
        Change status
      </Button>
      {dialog}
    </>
  );
}
