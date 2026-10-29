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
  resetGridmasterPersonTwoFactor,
  setGridmasterPersonInternal,
  changeGridmasterPersonEmail,
  sendGridmasterPasswordReset,
  terminateGridmasterUser,
  updateGridmasterPersonName,
  updateGridmasterUserActivation,
  type GridmasterPersonTarget,
} from "@/features/gridmaster/client";
import { requireCredentialAssurance } from "@/features/account/client";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { PersonAccountCard } from "./PersonAccountCard";
import { PersonHeader } from "./PersonHeader";
import { PersonInvitationActions } from "./PersonInvitationActions";
import { PersonMembershipActions } from "./PersonMembershipActions";
import { PersonOrganizationCard } from "./PersonOrganizationCard";
import { PersonSecurityCard } from "./PersonSecurityCard";
import { PersonHistoryCard } from "./PersonHistoryCard";
import { PersonNotificationsCard } from "./PersonNotificationsCard";
import { PersonSessionsCard } from "./PersonSessionsCard";
import { usePersonSecurityActions } from "./usePersonSecurityActions";
import { PersonStaffActions } from "./PersonStaffActions";
import { getPersonName, getPrimaryOrgId } from "./person-format";

type AccountDialog =
  | "deactivate"
  | "terminate"
  | "reinstate"
  | "forceLogout"
  | "reset"
  | "editName"
  | "changeEmail"
  | "mfaReset"
  | "internal"
  | null;

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
  onOpenOrganization,
}: {
  target: GridmasterPersonTarget;
  onBack: () => void;
  onImpersonate: (userId: string, orgId?: string) => void;
  onOpenOrganization: (orgId: string) => void;
}) {
  const queryClient = useQueryClient();
  const stepUp = useStepUpAction();
  const [dialog, setDialog] = useState<AccountDialog>(null);
  const [busy, setBusy] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");
  const [nameDraft, setNameDraft] = useState({ firstName: "", lastName: "" });
  const [emailDraft, setEmailDraft] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [internalReason, setInternalReason] = useState("");

  const personQuery = useQuery({
    queryKey: personKey(target),
    queryFn: () => fetchGridmasterPerson(target).then((result) => result.person),
    staleTime: 30_000,
  });
  const securityActions = usePersonSecurityActions(
    personQuery.data?.account?.userId ?? null,
    refresh,
  );

  function refresh() {
    // The whole person subtree: the record, history, notifications and schedule.
    void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.personAll() });
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
    success: string | (() => void),
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
      if (typeof success === "string") toast.success(success);
      else success();
      setDialog(null);
      setTerminateReason("");
      setResetReason("");
      setInternalReason("");
      refresh();
    } catch (error: unknown) {
      toast.error(formatClientErrorMessage(error, failure));
    } finally {
      setBusy(false);
    }
  }

  function handleDeactivate() {
    if (!primaryOrgId) return;
    const orgId = primaryOrgId;
    return runAssured(
      (userId, accessToken) =>
        updateGridmasterUserActivation({ userId, orgId, deactivate: !deactivated }, accessToken),
      deactivated ? "User reactivated" : "User deactivated",
      "That didn't work. Try again.",
    );
  }

  function handleTerminate() {
    const reason = terminateReason.trim();
    if (!reason) {
      toast.error("Give a reason for the termination.");
      return;
    }
    let sessionsEnded = true;
    return runAssured(
      async (userId, accessToken) => {
        const result = await terminateGridmasterUser(userId, reason, accessToken);
        sessionsEnded = result.sessionsEnded !== false;
      },
      () => {
        if (sessionsEnded) toast.success("Account terminated");
        else
          toast.warning(
            "Account terminated, but some devices may still be signed in. Use Force logout to finish.",
          );
      },
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
      <Button
        className="dg-btn dg-btn-secondary"
        onClick={() => {
          setNameDraft({
            firstName: profile?.firstName ?? "",
            lastName: profile?.lastName ?? "",
          });
          setDialog("editName");
        }}
        disabled={busy}
      >
        Edit name
      </Button>
      {!terminated ? (
        <Button
          className="dg-btn dg-btn-secondary"
          onClick={() => {
            setEmailDraft(account.email);
            setDialog("changeEmail");
          }}
          disabled={busy}
        >
          Change sign-in email
        </Button>
      ) : null}
      <Button
        className="dg-btn dg-btn-secondary"
        onClick={() => setDialog("internal")}
        disabled={busy}
      >
        {profile?.isInternal ? "Show to clients" : "Hide from clients"}
      </Button>
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
  const editNameConfirm = dialog === "editName";
  const changeEmailConfirm = dialog === "changeEmail";
  const mfaResetConfirm = dialog === "mfaReset";
  const internalConfirm = dialog === "internal";
  const markingInternal = !profile?.isInternal;
  const nextEmail = emailDraft.trim();
  const closeDialog = () => {
    setDialog(null);
    setTerminateReason("");
    setResetReason("");
    setInternalReason("");
  };

  return (
    <div className="flex flex-col gap-4">
      {back}
      <PersonHeader record={record} actions={quickActions} />
      <PersonAccountCard record={record} actions={accountActions} />
      <PersonSecurityCard
        record={record}
        twoFactorActions={
          account ? (
            <Button
              className="dg-btn dg-btn-secondary"
              onClick={() => setDialog("mfaReset")}
              disabled={busy}
            >
              Reset two-factor
            </Button>
          ) : undefined
        }
        renderDeviceActions={securityActions.renderDeviceActions}
        loginLockActions={securityActions.loginLockActions}
      />
      <PersonSessionsCard
        record={record}
        renderSessionActions={securityActions.renderSessionActions}
        renderPushActions={securityActions.renderPushActions}
        renderFeedActions={securityActions.renderFeedActions}
      />
      <PersonNotificationsCard record={record} />
      {securityActions.dialog}
      {record.organizations.map((organization) => (
        <PersonOrganizationCard
          key={organization.org.id}
          organization={organization}
          record={record}
          onOpenOrganization={onOpenOrganization}
          membershipActions={
            account ? (
              <PersonMembershipActions
                organization={organization}
                userId={account.userId}
                name={name}
                onChanged={refresh}
              />
            ) : undefined
          }
          renderStaffActions={(employee) => (
            <PersonStaffActions employee={employee} onChanged={refresh} />
          )}
          renderInvitationActions={(invitation) => (
            <PersonInvitationActions invitation={invitation} onChanged={refresh} />
          )}
        />
      ))}
      <PersonHistoryCard target={target} record={record} />
      {terminated ? (
        <SectionNotice
          tone="warning"
          messages={[
            "Organization admins cannot invite, reactivate, or re-add a terminated account.",
          ]}
        />
      ) : null}

      {deactivateConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title={deactivated ? "Reactivate this account?" : "Deactivate this account?"}
          message={
            deactivated
              ? "They regain platform access."
              : "They're blocked from signing in to every organization."
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
          title="Terminate this account?"
          message={
            <div className="flex flex-col gap-3">
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
          summary={{
            points: [
              "Every organization membership ends now.",
              "All sessions are signed out now.",
              "No organization admin can invite, reactivate, or re-add this person.",
              "Only a Gridmaster can reinstate the account.",
            ],
          }}
          confirmLabel="Terminate account"
          variant="danger"
          isLoading={busy}
          onConfirm={handleTerminate}
          onCancel={closeDialog}
        />
      )}

      {reinstateConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Reinstate this account?"
          message="This lifts the platform block only, and their memberships stay archived until you grant organization access again."
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
          title="End every session for this person?"
          message="They need to sign in again."
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
          title={`Send a password reset email to ${signInEmail}?`}
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
      {editNameConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Edit the name on this account?"
          message={
            <div className="flex flex-col gap-3">
              <span>Their staff records keep their own names.</span>
              <input
                className="dg-input"
                aria-label="First name"
                placeholder="First name"
                value={nameDraft.firstName}
                maxLength={100}
                onChange={(event) =>
                  setNameDraft((draft) => ({ ...draft, firstName: event.target.value }))
                }
              />
              <input
                className="dg-input"
                aria-label="Last name"
                placeholder="Last name"
                value={nameDraft.lastName}
                maxLength={100}
                onChange={(event) =>
                  setNameDraft((draft) => ({ ...draft, lastName: event.target.value }))
                }
              />
            </div>
          }
          confirmLabel="Save name"
          variant="info"
          isLoading={busy}
          onConfirm={() =>
            runAssured(
              (userId, accessToken) =>
                updateGridmasterPersonName(
                  userId,
                  { firstName: nameDraft.firstName.trim(), lastName: nameDraft.lastName.trim() },
                  accessToken,
                ),
              "Name saved",
              "We couldn't save that name. Try again.",
            )
          }
          onCancel={closeDialog}
        />
      )}

      {changeEmailConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Change this account's sign-in email?"
          message={
            <div className="flex flex-col gap-3">
              <span>They sign in with the new address from now on.</span>
              <input
                className="dg-input"
                type="email"
                aria-label="New sign-in email"
                value={emailDraft}
                maxLength={320}
                onChange={(event) => setEmailDraft(event.target.value)}
              />
            </div>
          }
          summary={{
            points: [
              "Every session ends.",
              "Both addresses are told about the change.",
              "Staff records take the new address too.",
            ],
          }}
          confirmLabel="Change email"
          variant="warning"
          isLoading={busy}
          onConfirm={() => {
            if (!nextEmail || nextEmail.toLowerCase() === signInEmail.toLowerCase()) {
              toast.error("Enter a different email address.");
              return;
            }
            return runAssured(
              (userId, accessToken) => changeGridmasterPersonEmail(userId, nextEmail, accessToken),
              `Sign-in email changed to ${nextEmail}`,
              "We couldn't change that email. Try again.",
            );
          }}
          onCancel={closeDialog}
        />
      )}
      {mfaResetConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Reset this account's two-factor?"
          message={
            <div className="flex flex-col gap-3">
              <span>
                The authenticator app is removed. Use this only after confirming who they are.
              </span>
              <textarea
                className="dg-input resize-y"
                aria-label="Reset reason"
                placeholder="Reason (required, recorded in the audit log)"
                value={resetReason}
                onChange={(event) => setResetReason(event.target.value)}
                rows={3}
              />
            </div>
          }
          summary={{
            points: [
              "Every session is signed out.",
              "An email tells them about the reset now.",
              "Two-factor is set up again at their next sign-in.",
            ],
          }}
          confirmLabel="Reset two-factor"
          variant="danger"
          isLoading={busy}
          onConfirm={() => {
            const reason = resetReason.trim();
            if (!reason) {
              toast.error("Give a reason for the reset.");
              return;
            }
            return runAssured(
              (userId, accessToken) => resetGridmasterPersonTwoFactor(userId, reason, accessToken),
              "Two-factor reset. They set it up again at their next sign-in.",
              "We couldn't reset their two-factor. Try again.",
            );
          }}
          onCancel={closeDialog}
        />
      )}
      {internalConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title={
            markingInternal ? "Mark this account as internal?" : "Make this a client account again?"
          }
          message={
            <div className="flex flex-col gap-3">
              <textarea
                className="dg-input resize-y"
                aria-label="Reason for the change"
                placeholder="Reason (required, recorded in the audit log)"
                value={internalReason}
                onChange={(event) => setInternalReason(event.target.value)}
                rows={3}
              />
            </div>
          }
          summary={{
            points: markingInternal
              ? [
                  "Their staff record, shifts, requests and access are hidden from their organizations.",
                  "Other internal accounts and Gridmasters still see them.",
                  "This person stops counting as a billed seat.",
                ]
              : [
                  "Their staff record, shifts and requests show to their organizations again.",
                  "This person counts as a billed seat.",
                ],
          }}
          confirmLabel={markingInternal ? "Hide from clients" : "Show to clients"}
          variant="warning"
          isLoading={busy}
          onConfirm={() => {
            const reason = internalReason.trim();
            if (!reason) {
              toast.error("Give a reason for the change.");
              return;
            }
            return runAssured(
              (userId, accessToken) =>
                setGridmasterPersonInternal(
                  userId,
                  { isInternal: markingInternal, reason },
                  accessToken,
                ),
              markingInternal ? "Hidden from clients" : "Shown to clients again",
              "We couldn't change that account. Try again.",
            );
          }}
          onCancel={closeDialog}
        />
      )}
      {stepUp.dialog}
    </div>
  );
}
