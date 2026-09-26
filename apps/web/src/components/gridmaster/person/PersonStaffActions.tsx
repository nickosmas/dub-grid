"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  activateEmployee,
  deactivateEmployee,
  EmployeeContactConflictError,
  EmployeeProfileConflictError,
  EmployeeStatusConflictError,
  removeEmployee,
  updateEmployee,
} from "@/features/employees/client";
import type { GridmasterStaffRecord } from "@/features/gridmaster/person-record";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { Employee } from "@/types";

type StatusChange = "activate" | "deactivate" | "remove";

const STATUS_COPY: Record<StatusChange, { title: string; label: string; message: string }> = {
  activate: {
    title: "Activate staff record",
    label: "Activate",
    message: "They return to schedules and staff lists in this organization.",
  },
  deactivate: {
    title: "Deactivate staff record",
    label: "Deactivate",
    message: "They leave schedules and staff lists here until they are activated again.",
  },
  remove: {
    title: "Remove staff record",
    label: "Remove",
    message: "They are removed from this organization's staff. The record is kept for history.",
  },
};

const CONFLICT_MESSAGE =
  "Their staff record changed elsewhere. Review the latest values and try again.";

function toEmployee(record: GridmasterStaffRecord): Employee {
  const {
    orgId: _orgId,
    createdBy: _createdBy,
    updatedBy: _updatedBy,
    updatedAt: _updatedAt,
    ...employee
  } = record;
  return employee;
}

/** Status and record edits for one staff record, through the People routes. */
export function PersonStaffActions({
  employee,
  onChanged,
}: {
  employee: GridmasterStaffRecord;
  onChanged: () => void;
}) {
  const [statusChange, setStatusChange] = useState<StatusChange | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    phone: employee.phone,
    email: employee.email,
    contactNotes: employee.contactNotes,
  });
  const [busy, setBusy] = useState(false);
  const linked = Boolean(employee.userId);

  function handleFailure(error: unknown, fallback: string) {
    if (
      error instanceof EmployeeProfileConflictError ||
      error instanceof EmployeeStatusConflictError
    ) {
      toast.error(CONFLICT_MESSAGE);
      onChanged();
      return;
    }
    toast.error(formatClientErrorMessage(error, fallback));
  }

  async function handleStatus() {
    if (!statusChange) return;
    setBusy(true);
    try {
      if (statusChange === "activate") {
        await activateEmployee(employee.id, employee.orgId, employee.version);
      } else if (statusChange === "deactivate") {
        await deactivateEmployee(
          employee.id,
          statusNote.trim() || undefined,
          employee.orgId,
          employee.version,
        );
      } else {
        await removeEmployee(
          employee.id,
          employee.orgId,
          employee.version,
          statusNote.trim() || undefined,
        );
      }
      toast.success("Staff status updated");
      setStatusChange(null);
      setStatusNote("");
      onChanged();
    } catch (error) {
      handleFailure(error, "We couldn't update their status. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    if (!firstName || !lastName) {
      toast.error("Enter a first and last name.");
      return;
    }
    setBusy(true);
    try {
      await updateEmployee(
        {
          ...toEmployee(employee),
          firstName,
          lastName,
          phone: draft.phone.trim(),
          contactNotes: draft.contactNotes.trim(),
          // A linked record's email is the sign-in email; it changes from Account.
          email: linked ? employee.email : draft.email.trim(),
        },
        employee.orgId,
        employee.version,
      );
      toast.success("Staff record saved");
      setEditing(false);
      onChanged();
    } catch (error) {
      if (error instanceof EmployeeContactConflictError) {
        toast.error(formatClientErrorMessage(error, "Those contact details are already in use."));
        return;
      }
      handleFailure(error, "We couldn't save that staff record. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const statusOptions: StatusChange[] =
    employee.status === "active" ? ["deactivate", "remove"] : ["activate", "remove"];
  const available = statusOptions.filter(
    (option) => !(option === "remove" && employee.status === "removed"),
  );

  return (
    <>
      <Button
        className="dg-btn dg-btn-secondary"
        onClick={() => {
          setDraft({
            firstName: employee.firstName,
            lastName: employee.lastName,
            phone: employee.phone,
            email: employee.email,
            contactNotes: employee.contactNotes,
          });
          setEditing(true);
        }}
        disabled={busy}
      >
        Edit staff record
      </Button>
      {available.map((option) => (
        <Button
          key={option}
          className="dg-btn dg-btn-secondary"
          onClick={() => setStatusChange(option)}
          disabled={busy}
        >
          {STATUS_COPY[option].label}
        </Button>
      ))}

      {statusChange && (
        <ConfirmDialog
          title={STATUS_COPY[statusChange].title}
          message={
            <div className="flex flex-col gap-3">
              <span>{STATUS_COPY[statusChange].message}</span>
              {statusChange !== "activate" ? (
                <textarea
                  className="dg-input resize-y"
                  aria-label="Status note"
                  placeholder="Note (optional)"
                  value={statusNote}
                  onChange={(event) => setStatusNote(event.target.value)}
                  rows={2}
                />
              ) : null}
            </div>
          }
          confirmLabel={STATUS_COPY[statusChange].label}
          variant={statusChange === "activate" ? "info" : "danger"}
          isLoading={busy}
          onConfirm={handleStatus}
          onCancel={() => {
            setStatusChange(null);
            setStatusNote("");
          }}
        />
      )}

      {editing && (
        <ConfirmDialog
          title="Edit staff record"
          message={
            <div className="flex flex-col gap-3">
              <input
                className="dg-input"
                aria-label="Staff first name"
                placeholder="First name"
                value={draft.firstName}
                onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
              />
              <input
                className="dg-input"
                aria-label="Staff last name"
                placeholder="Last name"
                value={draft.lastName}
                onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
              />
              <input
                className="dg-input"
                aria-label="Staff phone"
                placeholder="Phone"
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              />
              {linked ? (
                <span className="text-[12px] text-[var(--dg-color-text-muted)]">
                  Their email is their sign-in email. Change it from Account.
                </span>
              ) : (
                <input
                  className="dg-input"
                  type="email"
                  aria-label="Staff email"
                  placeholder="Email"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                />
              )}
              <textarea
                className="dg-input resize-y"
                aria-label="Contact notes"
                placeholder="Contact notes"
                value={draft.contactNotes}
                onChange={(event) => setDraft({ ...draft, contactNotes: event.target.value })}
                rows={2}
              />
            </div>
          }
          confirmLabel="Save staff record"
          variant="info"
          isLoading={busy}
          onConfirm={handleSave}
          onCancel={() => setEditing(false)}
        />
      )}
    </>
  );
}
