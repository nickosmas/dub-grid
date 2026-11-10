"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { getRequiredStaffEmailError, normalizeRequiredStaffEmail } from "@dubgrid/contracts";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { requireCredentialAssurance } from "@/features/account/client";
import { moveEmployeeToNewEmail } from "@/features/employees/client";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { Employee } from "@/types";

interface MoveEmailDialogProps {
  employee: Employee;
  orgId: string;
  name: string;
  onMoved: (employee: Employee) => void;
  onClose: () => void;
}

/** Points a joined person's staff record at a new address, for someone who lost their mailbox. */
export function MoveEmailDialog({ employee, orgId, name, onMoved, onClose }: MoveEmailDialogProps) {
  const stepUp = useStepUpAction();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const emailError = email.trim() ? getRequiredStaffEmailError(email) : null;

  async function handleMove() {
    setSaving(true);
    try {
      await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        const nextEmail = normalizeRequiredStaffEmail(email);
        const result = await moveEmployeeToNewEmail({
          orgId,
          empId: employee.id,
          email: nextEmail,
          expectedVersion: employee.version,
        });
        onMoved(result.employee);
        if (result.invited) toast.success(`Invite sent to ${nextEmail}.`);
        else toast.warning("They were moved, but the invite didn't send. Send it from their page.");
        onClose();
      });
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "We couldn't move them to that email. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {!stepUp.dialog ? (
        <ConfirmDialog
          title={`Move ${name} to a new email?`}
          icon={Mail}
          variant="warning"
          confirmLabel="Move and invite"
          isLoading={saving}
          confirmDisabled={!email.trim() || Boolean(emailError)}
          onCancel={() => {
            if (!saving) onClose();
          }}
          hasUnsavedChanges={email.trim().length > 0}
          onConfirm={handleMove}
          message={
            <div className="flex flex-col gap-3.5">
              <span>
                Use this only if they can&apos;t get into this email anymore. If they still can, ask
                them to change it on their profile.
              </span>
              <div>
                <label className="dg-label" htmlFor="move-email-input">
                  New email
                </label>
                <input
                  id="move-email-input"
                  className="dg-input"
                  type="email"
                  autoComplete="off"
                  autoFocus
                  value={email}
                  disabled={saving}
                  onChange={(event) => setEmail(event.target.value)}
                />
                {emailError ? <p className="dg-form-error">{emailError}</p> : null}
              </div>
            </div>
          }
          summary={{
            points: [
              "Their current sign-in email loses access to this organization.",
              "An invite goes to the new email, with the same access role.",
              "Their staff record, shifts and history stay as they are.",
            ],
          }}
        />
      ) : null}
      {stepUp.dialog}
    </>
  );
}
