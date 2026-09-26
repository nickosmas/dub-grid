"use client";

import type { Employee } from "@/types";
import type { PersonAccountState } from "@/lib/person-account-state";
import { formatRelativeTime } from "@/lib/utils";
import { MaybeHint } from "@/components/ui/hint";

interface PersonRecordCardProps {
  employee: Employee;
  accountState: PersonAccountState;
  /** Absent when the directory withholds sign-in activity from this viewer. */
  lastSignInAt?: string | null;
}

const ACCOUNT_LABELS: Record<PersonAccountState["kind"], string> = {
  linked: "Linked account",
  pending: "Invitation pending",
  expired: "Invitation expired",
  "not-invited": "Not invited",
  "no-email": "No email",
};

const STATUS_LABELS: Record<Employee["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  removed: "Removed",
};

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The facts about a person's place in the organization, in one place. */
export function PersonRecordCard({ employee, accountState, lastSignInAt }: PersonRecordCardProps) {
  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Record</div>
          <div className="dg-card-subtitle">
            When they were added and joined, their status, and their account.
          </div>
        </div>
      </div>
      <dl className="dg-card-body grid gap-4 sm:grid-cols-2">
        <RecordField
          label="Date added"
          value={employee.createdAt ? formatDay(employee.createdAt) : "Not recorded"}
          tabular={Boolean(employee.createdAt)}
        />
        {employee.joinedAt !== undefined ? (
          <RecordField
            label="Date joined"
            value={employee.joinedAt ? formatDay(employee.joinedAt) : "Not joined"}
            tabular={Boolean(employee.joinedAt)}
          />
        ) : null}
        <RecordField label="Status" value={STATUS_LABELS[employee.status]} />
        <RecordField
          label="Status changed"
          value={employee.statusChangedAt ? formatDay(employee.statusChangedAt) : "Not recorded"}
          tabular={Boolean(employee.statusChangedAt)}
        />
        <RecordField label="Account" value={ACCOUNT_LABELS[accountState.kind]} />
        {lastSignInAt ? (
          <RecordField
            label="Last active"
            value={formatRelativeTime(lastSignInAt)}
            hint={new Date(lastSignInAt).toLocaleString()}
            tabular
          />
        ) : null}
        {employee.statusNote ? (
          <div className="sm:col-span-2">
            <RecordField label="Status note" value={employee.statusNote} />
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function RecordField({
  label,
  value,
  hint,
  tabular = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tabular?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="dg-type-field-title">{label}</dt>
      <dd
        className={`mt-1 whitespace-pre-wrap text-[13px] text-[var(--dg-color-text-primary)] ${tabular ? "dg-tabular-nums" : ""}`}
      >
        <MaybeHint content={hint}>
          <span>{value}</span>
        </MaybeHint>
      </dd>
    </div>
  );
}
