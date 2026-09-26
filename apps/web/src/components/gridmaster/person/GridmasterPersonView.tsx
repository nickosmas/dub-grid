"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SectionNotice } from "@/components/ui/SectionNotice";
import {
  fetchGridmasterPerson,
  forceLogoutGridmasterUser,
  reinstateGridmasterUser,
  sendGridmasterPasswordReset,
  terminateGridmasterUser,
  updateGridmasterUserActivation,
  type GridmasterPersonTarget,
} from "@/features/gridmaster/client";
import { requireCredentialAssurance } from "@/features/account/client";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { PersonAccountCard } from "./PersonAccountCard";
import { PersonHeader } from "./PersonHeader";
import { getPersonName, getPrimaryOrgId } from "./person-format";

type AccountDialog = "deactivate" | "terminate" | "reinstate" | "forceLogout" | "reset" | null;

function personKey(target: GridmasterPersonTarget) {
  return target.kind === "user"
    ? queryKeys.gridmaster.person("user", target.userId)
    : queryKeys.gridmaster.person("staff", target.employeeId);
}

/** One person, everything about them, and every action support needs. */
export default function GridmasterPersonView({
  target,
  onBack,
  onImpersonate,
}: {
  target: GridmasterPersonTarget;
  onBack: () => void;
  onImpersonate: (userId: string, orgId?: string) => void;
}) {
  const queryClient = useQueryClient();
  const stepUp = useStepUpAction();
  const [dialog, setDialog] = useState<AccountDialog>(null);
  const [busy, setBusy] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");

  const personQuery = useQuery({
    queryKey: personKey(target),
    queryFn: () => fetchGridmasterPerson(target).then((result) => result.person),
    staleTime: 30_000,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: personKey(target) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.allUsers() });
  }

  const back = (
    <Button className="dg-btn dg-btn-ghost self-start" onClick={onBack}>
      <ArrowLeft size={16} aria-hidden />
      Back to all users
    </Button>
  );

  if (personQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {back}
        <div className="dg-skeleton dg-skeleton--heading" />
        <div className="dg-skeleton h-40" />
      </div>
    );
  }

  const record = personQuery.data;
  if (!record) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <SectionNotice
          tone="danger"
          messages={[formatClientErrorMessage(personQuery.error, "We couldn't load this person.")]}
        />
        <Button
          className="dg-btn dg-btn-secondary self-start"
          onClick={() => personQuery.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const account = record.account;
  const profile = record.profile;
  const name = getPersonName(record);
  const primaryOrgId = getPrimaryOrgId(record);
  const terminated = Boolean(profile?.terminatedAt);
  const deactivated = Boolean(profile?.deactivatedAt);
  const signInEmail = account?.email ?? "";

  async function runAssured(
    action: (userId: string, accessToken: string) => Promise<unknown>,
    success: string,
    failure: string,
  ) {
    if (!account) return;
    setBusy(true);
    try {
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        await action(account.userId, accessToken);
      });
      if (!completed) return;
      toast.success(success);
      setDialog(null);
      setTerminateReason("");
      refresh();
    } catch (error: unknown) {
      toast.error(formatClientErrorMessage(error, failure));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!account || !primaryOrgId) return;
    setBusy(true);
    try {
      await updateGridmasterUserActivation({
        userId: account.userId,
        orgId: primaryOrgId,
        deactivate: !deactivated,
      });
      toast.success(deactivated ? "User reactivated" : "User deactivated");
      setDialog(null);
      refresh();
    } catch (error: unknown) {
      toast.error(formatClientErrorMessage(error, "Action failed"));
    } finally {
      setBusy(false);
    }
  }

  function handleTerminate() {
    const reason = terminateReason.trim();
    if (!reason) {
      toast.error("Give a reason for the termination.");
      return;
    }
    return runAssured(
      (userId, accessToken) => terminateGridmasterUser(userId, reason, accessToken),
      "Account terminated",
      "We couldn't terminate that account. Try again.",
    );
  }

  const quickActions = account ? (
    <>
      {!terminated ? (
        <Button
          className="dg-btn dg-btn-secondary"
          onClick={() => onImpersonate(account.userId, primaryOrgId ?? undefined)}
        >
          Impersonate
        </Button>
      ) : null}
      <Button
        className="dg-btn dg-btn-secondary"
        onClick={() => setDialog("forceLogout")}
        disabled={busy}
      >
        Force logout
      </Button>
      {!terminated ? (
        <Button
          className="dg-btn dg-btn-secondary"
          onClick={() => setDialog("reset")}
          disabled={busy}
        >
          Send password reset
        </Button>
      ) : null}
    </>
  ) : null;

  const accountActions = account ? (
    <>
      {primaryOrgId && !terminated ? (
        <Button
          className="dg-btn dg-btn-secondary"
          onClick={() => setDialog("deactivate")}
          disabled={busy}
        >
          {deactivated ? "Reactivate" : "Deactivate"}
        </Button>
      ) : null}
      {terminated ? (
        <Button
          className="dg-btn dg-btn-secondary"
          onClick={() => setDialog("reinstate")}
          disabled={busy}
        >
          Reinstate
        </Button>
      ) : (
        <Button
          className="dg-btn dg-btn-danger ml-auto"
          onClick={() => setDialog("terminate")}
          disabled={busy}
        >
          Terminate account
        </Button>
      )}
    </>
  ) : null;

  const deactivateConfirm = dialog === "deactivate";
  const terminateConfirm = dialog === "terminate";
  const reinstateConfirm = dialog === "reinstate";
  const forceLogoutConfirm = dialog === "forceLogout";
  const resetConfirm = dialog === "reset";
  const closeDialog = () => {
    setDialog(null);
    setTerminateReason("");
  };

  return (
    <div className="flex flex-col gap-4">
      {back}
      <PersonHeader record={record} actions={quickActions} />
      <PersonAccountCard record={record} actions={accountActions} />
      {terminated ? (
        <SectionNotice
          tone="warning"
          messages={[
            "Organization admins cannot invite, reactivate, or re-add a terminated account.",
          ]}
        />
      ) : null}

      {deactivateConfirm && (
        <ConfirmDialog
          title={deactivated ? "Reactivate user" : "Deactivate user"}
          message={
            deactivated
              ? `Reactivate "${name}"? They will regain platform access.`
              : `Deactivate "${name}"? They will be blocked from signing in to every organization.`
          }
          confirmLabel={deactivated ? "Reactivate" : "Deactivate"}
          variant={deactivated ? "info" : "danger"}
          isLoading={busy}
          onConfirm={handleDeactivate}
          onCancel={closeDialog}
        />
      )}

      {/* The reason is recorded on the account and in the audit log. */}
      {terminateConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Terminate account"
          message={
            <div className="flex flex-col gap-3">
              <span>
                Terminate &quot;{name}&quot;? They lose every organization membership and every
                session now, and no organization admin can invite, reactivate, or re-add them. Only
                a Gridmaster can reinstate the account.
              </span>
              <textarea
                className="dg-input resize-y"
                aria-label="Termination reason"
                placeholder="Reason (required, recorded in the audit log)"
                value={terminateReason}
                onChange={(event) => setTerminateReason(event.target.value)}
                rows={3}
              />
            </div>
          }
          confirmLabel="Terminate account"
          variant="danger"
          isLoading={busy}
          onConfirm={handleTerminate}
          onCancel={closeDialog}
        />
      )}

      {reinstateConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Reinstate account"
          message={`Reinstate "${name}"? This lifts the platform block only. Their memberships stay archived until you grant organization access again.`}
          confirmLabel="Reinstate"
          variant="info"
          isLoading={busy}
          onConfirm={() =>
            runAssured(
              (userId, accessToken) => reinstateGridmasterUser(userId, accessToken),
              "Account reinstated. Grant organization access again to let them back in.",
              "We couldn't reinstate that account. Try again.",
            )
          }
          onCancel={closeDialog}
        />
      )}

      {forceLogoutConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Force logout"
          message={`End every session for "${name}"? They will need to sign in again.`}
          confirmLabel="Force logout"
          variant="danger"
          isLoading={busy}
          onConfirm={() =>
            runAssured(
              (userId, accessToken) => forceLogoutGridmasterUser(userId, accessToken),
              "User sessions terminated",
              "We couldn't force logout. Try again.",
            )
          }
          onCancel={closeDialog}
        />
      )}

      {resetConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Send password reset"
          message={`Send a password reset email to "${signInEmail}"?`}
          confirmLabel="Send reset email"
          variant="info"
          isLoading={busy}
          onConfirm={() =>
            runAssured(
              (_userId, accessToken) => sendGridmasterPasswordReset(signInEmail, accessToken),
              `Password reset email sent to ${signInEmail}`,
              "We couldn't send that password reset.",
            )
          }
          onCancel={closeDialog}
        />
      )}
      {stepUp.dialog}
    </div>
  );
}
