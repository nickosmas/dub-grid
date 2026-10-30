"use client";

import {
  changedElsewhereMessage,
  bulkStatusDone,
  countPeople,
  describeBulkStatusAction,
  type BulkStatusAction,
} from "@dubgrid/domain";
import ConfirmDialog from "@/components/ConfirmDialog";
import { STATUS_ACTION_ICONS } from "@/components/staff/status-action-icons";
import Modal from "@/components/Modal";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/Button";
import CalendarDatePicker from "@/components/ui/calendar-date-picker";
import { addDays, formatDateKey } from "@/lib/utils";
import type { BulkStatusOutcome } from "@/features/employees/client";

/** Someone a bulk change leaves alone or couldn't change, and why. */
export interface BulkStatusPersonNote {
  id: string;
  name: string;
  reason: string;
}

export interface BulkStatusDialogPerson {
  id: string;
  name: string;
  status: "active" | "inactive" | "removed";
  userId?: string | null;
  focusAreaIds: readonly number[];
  suspendedAt?: string | null;
  archivedAt?: string | null;
  plannedStatus?: "away" | "removed" | "suspended" | "active" | null;
  plannedFrom?: string | null;
}

export interface BulkStatusDialogState {
  action: BulkStatusAction;
  eligible: BulkStatusDialogPerson[];
  skipped: BulkStatusPersonNote[];
  note: string;
  returnDate: string;
  /** Set once it ran and some people weren't changed. */
  result: { changed: number; notChanged: BulkStatusPersonNote[] } | null;
}

const CONFLICT_REASON = changedElsewhereMessage("their status");
const FAILED_REASON = "We couldn't change their status. Try again.";

/** Who a bulk change didn't reach, and why, from the server's answer per person. */
export function describeBulkStatusFailures(
  outcomes: readonly BulkStatusOutcome[],
  people: readonly { id: string; name: string }[],
): BulkStatusPersonNote[] {
  const byId = new Map(outcomes.map((outcome) => [outcome.empId, outcome]));
  return people.flatMap(({ id, name }) => {
    const outcome = byId.get(id);
    if (outcome?.ok) return [];
    const reason =
      outcome?.code === "EMPLOYEE_STATUS_CONFLICT"
        ? CONFLICT_REASON
        : (outcome?.error ?? FAILED_REASON);
    return [{ id, name, reason }];
  });
}

/** Mark away and Offboard store a reason. */
const TAKES_NOTE: ReadonlySet<BulkStatusAction> = new Set(["markAway", "archive"]);

const VARIANTS: Record<BulkStatusAction, "danger" | "warning" | "info"> = {
  markActive: "info",
  reinstate: "info",
  restore: "info",
  markAway: "warning",
  suspend: "warning",
  archive: "danger",
};

const LABEL_CLASS =
  "text-[length:var(--dg-fs-label)] font-semibold text-[var(--dg-color-text-primary)]";

function PeopleByReason({
  title,
  people,
  showTitle = true,
}: {
  title: string;
  people: BulkStatusPersonNote[];
  /** Off where the dialog's title already says it. */
  showTitle?: boolean;
}) {
  const byReason = new Map<string, string[]>();
  for (const person of people) {
    byReason.set(person.reason, [...(byReason.get(person.reason) ?? []), person.name]);
  }
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      {showTitle ? (
        <span className={`${LABEL_CLASS} dg-tabular-nums`}>
          {title} ({people.length})
        </span>
      ) : null}
      <ul className="m-0 flex max-h-48 list-none flex-col gap-2 overflow-y-auto p-0">
        {[...byReason].map(([reason, names]) => (
          <li key={reason} className="flex flex-col gap-0.5">
            <span className="text-[length:var(--dg-fs-body-sm)] text-[var(--dg-color-text-primary)]">
              {names.join(", ")}
            </span>
            <span className="text-[length:var(--dg-fs-caption)] text-[var(--dg-color-text-muted)]">
              {reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface BulkStatusDialogProps {
  state: BulkStatusDialogState;
  onChange: (state: BulkStatusDialogState) => void;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
  /** The change is running; kept outside so it survives a step-up prompt. */
  running: boolean;
}

/**
 * The People list's bulk status confirmation (51h): the change's copy, who it
 * skips and why, and, once it ran with some people not changed, who and why.
 */
export function BulkStatusDialog({
  state,
  onChange,
  onConfirm,
  onClose,
  running,
}: BulkStatusDialogProps) {
  const { action, eligible, skipped, note, returnDate, result } = state;

  if (result) {
    return (
      <Modal
        icon={CircleAlert}
        iconTone="warning"
        title={`${countPeople(result.notChanged.length)} not changed`}
        onClose={onClose}
        footer={
          <div className="flex justify-end">
            <Button className="dg-btn dg-btn-primary" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {result.changed > 0 ? (
            <p className="m-0 text-[length:var(--dg-fs-body-sm)] text-[var(--dg-color-text-secondary)]">
              {bulkStatusDone(action, result.changed)}. Anyone not changed is still selected.
            </p>
          ) : (
            <p className="m-0 text-[length:var(--dg-fs-body-sm)] text-[var(--dg-color-text-secondary)]">
              They&apos;re still selected.
            </p>
          )}
          <PeopleByReason title="Not changed" people={result.notChanged} showTitle={false} />
        </div>
      </Modal>
    );
  }

  const copy = describeBulkStatusAction(action, eligible, {
    returnDate: action === "markAway" ? returnDate || null : null,
  });
  const returnMinDate = formatDateKey(addDays(new Date(), 1));

  return (
    <ConfirmDialog
      icon={STATUS_ACTION_ICONS[action]}
      title={copy.title}
      message={
        <div className="flex flex-col gap-3.5">
          {copy.message ? <span>{copy.message}</span> : null}
          {action === "markAway" ? (
            <div className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Return date</span>
              <CalendarDatePicker
                value={returnDate}
                onChange={(value) => onChange({ ...state, returnDate: value })}
                label="Return date"
                placeholder="No return date"
                minDate={returnMinDate}
                allowClear
              />
              <span className="text-[length:var(--dg-fs-caption)] text-[var(--dg-color-text-muted)]">
                Everyone is back to Active on this day. Leave it empty to mark them active yourself.
              </span>
            </div>
          ) : null}
          {TAKES_NOTE.has(action) ? (
            <input
              className="dg-input w-full text-[length:var(--dg-fs-label)]"
              value={note}
              onChange={(event) => onChange({ ...state, note: event.target.value })}
              disabled={running}
              placeholder="Reason (optional, applies to all selected)"
              aria-label="Reason (optional)"
              maxLength={500}
            />
          ) : null}
          {skipped.length > 0 ? <PeopleByReason title="Skipped" people={skipped} /> : null}
        </div>
      }
      summary={{ points: [...copy.points, ...copy.unchanged] }}
      confirmLabel={copy.label}
      variant={VARIANTS[action]}
      isLoading={running}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}
