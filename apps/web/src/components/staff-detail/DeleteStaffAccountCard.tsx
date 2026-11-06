"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { requireCredentialAssurance } from "@/features/account/client";
import { deleteEmployeeAccount, fetchAccountDeletionState } from "@/features/employees/client";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { Employee } from "@/types";

const CONFIRM_PHRASE = "DELETE ACCOUNT";

interface DeleteStaffAccountCardProps {
  employee: Employee;
  orgId: string;
  name: string;
  onDeleted: (employee: Employee) => void;
}

/** Last on someone's Account tab, for a Super Admin, once that person has a sign-in. */
export function DeleteStaffAccountCard({
  employee,
  orgId,
  name,
  onDeleted,
}: DeleteStaffAccountCardProps) {
  const stepUp = useStepUpAction();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const offboarded = employee.status === "removed";
  const { data: deletionState } = useQuery({
    queryKey: ["employees", orgId, employee.id, "accountDeletion"],
    queryFn: () => fetchAccountDeletionState(orgId, employee.id),
    enabled: offboarded,
  });

  function close() {
    if (deleting) return;
    setConfirming(false);
    setTyped("");
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        const result = await deleteEmployeeAccount({
          orgId,
          empId: employee.id,
          confirmation: typed,
        });
        onDeleted(result.employee);
        toast.success(`${name}'s account was deleted.`);
        setConfirming(false);
        setTyped("");
      });
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "We couldn't delete that account. Try again."));
    } finally {
      setDeleting(false);
    }
  }

  const usedElsewhere = deletionState?.usedElsewhere ?? false;
  const canDelete = offboarded && deletionState !== undefined && !usedElsewhere;
  const message = !offboarded
    ? "Offboard them first. Their account can be deleted once they've left."
    : usedElsewhere
      ? "This account is also used outside your organization, so it can't be deleted here."
      : "Removes their sign-in for good. Their staff record, shifts and history stay.";

  return (
    <section aria-labelledby="staff-delete-account-title" className="dg-card">
      <div className="dg-card-header">
        <h2 id="staff-delete-account-title" className="dg-card-title">
          Delete account
        </h2>
      </div>
      <div className="dg-card-body flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 min-w-0 flex-1 basis-60 text-[14px] text-[var(--dg-color-text-secondary)]">
          {message}
        </p>
        {canDelete ? (
          <Button
            type="button"
            className="dg-btn dg-btn-danger dg-btn-sm"
            onClick={() => setConfirming(true)}
          >
            Delete account
          </Button>
        ) : null}
      </div>

      {confirming && !stepUp.dialog ? (
        <ConfirmDialog
          title={`Delete ${name}'s account?`}
          icon={Trash2}
          variant="danger"
          confirmLabel="Delete account"
          isLoading={deleting}
          confirmDisabled={typed !== CONFIRM_PHRASE}
          onCancel={close}
          onConfirm={handleDelete}
          message={
            <div className="flex flex-col gap-3.5">
              <span>This removes their sign-in for good, and it can&apos;t be undone.</span>
              <div>
                <label className="dg-label" htmlFor="delete-staff-account-input">
                  Type <strong>{CONFIRM_PHRASE}</strong> to confirm
                </label>
                <input
                  id="delete-staff-account-input"
                  className="dg-input"
                  autoComplete="off"
                  autoFocus
                  value={typed}
                  disabled={deleting}
                  onChange={(event) => setTyped(event.target.value)}
                />
              </div>
            </div>
          }
          summary={{
            points: [
              "The staff record, shifts and history stay in your organization.",
              "An email tells them the account was deleted.",
            ],
          }}
        />
      ) : null}
      {stepUp.dialog}
    </section>
  );
}
