"use client";

import { useState } from "react";
import type { AbsenceType, Employee } from "@/types";
import { Button } from "@/components/Button";
import { addDays, formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";
import CalendarDatePicker from "@/components/ui/calendar-date-picker";
import CustomSelect from "@/components/CustomSelect";
import {
  canMarkInactive,
  describeStatusAction,
  statusUndoAction,
  type StatusAction,
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
  /** Gives a suspended person their access back (51c); hidden when absent. */
  onReinstate?: (empId: string) => void | Promise<unknown>;
  /** Live absence types; with a return date, one can fill the away days (51f). */
  absenceTypes?: readonly AbsenceType[];
  onRemove: (empId: string, note?: string) => void | Promise<unknown>;
  variant: "panel" | "page";
  /** Stretches the active button to fill its container, for an equal-width row of actions. */
  fillWidth?: boolean;
  /** Hides the confirmation while a step-up prompt asks for fresh proof. */
  stepUpOpen?: boolean;
}

type ConfirmingAction =
  Exclude<StatusAction, "restore" | "markActive" | "reinstate"> | "undo" | "reinstate";

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

const NOTE_PLACEHOLDERS: Record<"markAway" | "archive", string> = {
  markAway: "Reason (optional) - e.g. Family leave",
  archive: "Reason (optional) - e.g. Left the company",
};

export function EmployeeStatusActions({
  employee,
  canEdit,
  isSelf = false,
  onDeactivate,
  onActivate,
  onRemove,
  onSetReturnDate,
  onReinstate,
  absenceTypes = [],
  variant,
  fillWidth = false,
  stepUpOpen = false,
}: EmployeeStatusActionsProps) {
  // Away only takes someone off the schedule, so a management-only person can
  // only be archived.
  const canBeAway = canMarkInactive(employee.focusAreaIds);
  const [confirming, setConfirming] = useState<ConfirmingAction | null>(null);
  const [note, setNote] = useState(employee.statusNote || "");
  const [returnDate, setReturnDate] = useState(employee.awayUntil ?? "");
  const [absenceTypeId, setAbsenceTypeId] = useState(employee.awayAbsenceTypeId ?? NO_ABSENCE);
  // The confirmation unmounts while a step-up prompt shows, which drops its
  // own latch, so the pending state lives here to survive the round trip.
  const [pending, setPending] = useState(false);

  const displayName = getEmployeeDisplayName(employee);
  const undoAction = statusUndoAction(employee.status);

  async function runPending(action: () => unknown) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  function closeConfirm() {
    setConfirming(null);
    setNote(employee.statusNote || "");
    setReturnDate(employee.awayUntil ?? "");
    setAbsenceTypeId(employee.awayAbsenceTypeId ?? NO_ABSENCE);
  }

  function openConfirm(action: ConfirmingAction) {
    setReturnDate(employee.awayUntil ?? "");
    setAbsenceTypeId(employee.awayAbsenceTypeId ?? NO_ABSENCE);
    setConfirming(action);
  }

  // The absence only applies with a return date, so it goes when the date does.
  const chosenAbsenceTypeId = returnDate && absenceTypeId !== NO_ABSENCE ? absenceTypeId : null;
  const chosenAbsenceName =
    absenceTypes.find((absenceType) => absenceType.id === chosenAbsenceTypeId)?.name ?? null;
  const absenceField =
    returnDate && absenceTypes.length > 0 ? (
      <AwayAbsenceField
        value={chosenAbsenceTypeId ?? NO_ABSENCE}
        absenceTypes={absenceTypes}
        onChange={setAbsenceTypeId}
      />
    ) : null;

  // Self-action guard: you can't change your own status, so callers hide this
  // whole section rather than show it with nothing actionable inside.
  if (!canEdit || isSelf) return null;

  const confirmation = (() => {
    if (!confirming || stepUpOpen) return null;
    if (confirming === "reinstate") {
      const copy = describeStatusAction("reinstate", displayName);
      return (
        <ConfirmDialog
          isLoading={pending}
          title={copy.title}
          message={copy.message}
          summary={{ points: copy.points }}
          confirmLabel={copy.label}
          variant="warning"
          onConfirm={async () => {
            await runPending(() => onReinstate?.(employee.id));
            closeConfirm();
          }}
          onCancel={closeConfirm}
        />
      );
    }
    if (confirming === "undo") {
      if (!undoAction) return null;
      const copy = describeStatusAction(undoAction, displayName);
      return (
        <ConfirmDialog
          isLoading={pending}
          title={copy.title}
          message={copy.message || undefined}
          summary={{ points: copy.points }}
          confirmLabel={copy.label}
          variant="warning"
          onConfirm={async () => {
            await runPending(() => onActivate(employee.id));
            closeConfirm();
          }}
          onCancel={closeConfirm}
        />
      );
    }
    if (confirming === "setReturnDate") {
      const currentReturnDate = employee.awayUntil ?? null;
      const currentAbsenceTypeId = employee.awayAbsenceTypeId ?? null;
      const copy = describeStatusAction("setReturnDate", displayName, {
        returnDate: returnDate || null,
        currentReturnDate,
        absenceName: chosenAbsenceName,
      });
      return (
        <ConfirmDialog
          isLoading={pending}
          title={copy.title}
          message={
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {copy.message ? <span>{copy.message}</span> : null}
              <ReturnDateField value={returnDate} onChange={setReturnDate} />
              {absenceField}
            </div>
          }
          summary={{ points: copy.points }}
          confirmLabel={copy.label}
          confirmDisabled={
            (returnDate || null) === currentReturnDate &&
            chosenAbsenceTypeId === currentAbsenceTypeId
          }
          variant="warning"
          onConfirm={async () => {
            await runPending(() =>
              onSetReturnDate?.(employee.id, returnDate || null, chosenAbsenceTypeId),
            );
            closeConfirm();
          }}
          onCancel={closeConfirm}
        />
      );
    }
    const isArchive = confirming === "archive";
    const copy = describeStatusAction(confirming, displayName, {
      returnDate: isArchive ? null : returnDate || null,
      absenceName: isArchive ? null : chosenAbsenceName,
    });
    return (
      <ConfirmDialog
        isLoading={pending}
        title={copy.title}
        message={
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {copy.message ? <span>{copy.message}</span> : null}
            <input
              className="dg-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={NOTE_PLACEHOLDERS[confirming]}
              aria-label="Reason (optional)"
              style={{ fontSize: "var(--dg-fs-label)", width: "100%" }}
            />
            {isArchive ? null : <ReturnDateField value={returnDate} onChange={setReturnDate} />}
            {isArchive ? null : absenceField}
          </div>
        }
        summary={{ points: copy.points }}
        confirmLabel={copy.label}
        variant={isArchive ? "danger" : "warning"}
        onConfirm={async () => {
          const trimmedNote = note.trim() || undefined;
          // Revoking any linked org membership happens server-side, atomically
          // with the status change (see /api/employees/status), not as a
          // second client call, so the two can't diverge on partial failure.
          await runPending(() =>
            isArchive
              ? onRemove(employee.id, trimmedNote)
              : returnDate
                ? onDeactivate(employee.id, trimmedNote, returnDate, chosenAbsenceTypeId)
                : onDeactivate(employee.id, trimmedNote),
          );
          closeConfirm();
        }}
        onCancel={closeConfirm}
      />
    );
  })();

  const buttonStyle = fillWidth
    ? { flex: 1, width: "100%", minWidth: 0 }
    : variant === "page"
      ? { flex: "0 0 auto", minWidth: 140 }
      : { flex: 1, minWidth: 0 };
  const groupStyle = fillWidth
    ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }
    : { display: "flex", gap: 8, flexWrap: variant === "page" ? ("wrap" as const) : undefined };

  if (undoAction) {
    const copy = describeStatusAction(undoAction, displayName);
    const returnDateLabel = describeStatusAction("setReturnDate", displayName, {
      currentReturnDate: employee.awayUntil ?? null,
    }).label;
    const canSetReturnDate = Boolean(onSetReturnDate) && employee.status === "inactive";
    const undoButton = (
      <Button
        onClick={() => openConfirm("undo")}
        className={variant === "page" ? "dg-btn dg-btn-success" : "dg-btn dg-btn-ghost dg-btn-xs"}
        style={{
          // Inline success colors here would outrank the variant's :hover,
          // so the page button wears the class and only ghost tints inline.
          ...(variant === "page" ? null : { color: "var(--dg-color-success-text)" }),
          ...(fillWidth
            ? { flex: 1, width: "100%" }
            : canSetReturnDate && variant === "page"
              ? buttonStyle
              : null),
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {copy.label}
      </Button>
    );
    if (!canSetReturnDate) {
      return (
        <>
          {undoButton}
          {confirmation}
        </>
      );
    }
    return (
      <>
        <div style={groupStyle}>
          {undoButton}
          <Button
            onClick={() => openConfirm("setReturnDate")}
            className={
              variant === "page" ? "dg-btn dg-btn-secondary" : "dg-btn dg-btn-ghost dg-btn-xs"
            }
            style={variant === "page" ? buttonStyle : undefined}
          >
            {returnDateLabel}
          </Button>
        </div>
        {confirmation}
      </>
    );
  }

  // Suspended (51c) people are stored active; Reinstate takes Mark away's place.
  const canReinstate = Boolean(onReinstate) && Boolean(employee.suspendedAt);

  return (
    <>
      <div style={groupStyle}>
        {canReinstate && (
          <Button
            onClick={() => openConfirm("reinstate")}
            className="dg-btn dg-btn-success"
            style={buttonStyle}
          >
            {describeStatusAction("reinstate", displayName).label}
          </Button>
        )}
        {canBeAway && !employee.suspendedAt && (
          <Button
            onClick={() => openConfirm("markAway")}
            className="dg-btn dg-btn-warning-filled"
            style={buttonStyle}
          >
            {describeStatusAction("markAway", displayName).label}
          </Button>
        )}
        <Button
          onClick={() => openConfirm("archive")}
          className="dg-btn dg-btn-secondary"
          style={{
            ...buttonStyle,
            // Alone, Archive spans both columns rather than sitting half-width.
            ...(fillWidth && !canBeAway && !canReinstate ? { gridColumn: "1 / -1" } : null),
          }}
        >
          {describeStatusAction("archive", displayName).label}
        </Button>
      </div>
      {confirmation}
    </>
  );
}
