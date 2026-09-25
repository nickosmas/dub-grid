"use client";

import { FormEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Form } from "@/components/Form";
import { Button } from "@/components/Button";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import Modal from "@/components/Modal";
import { CloseButton } from "@/components/ui/CloseButton";
import { MaybeHint } from "@/components/ui/hint";
import {
  demoteGridmasterAccount,
  fetchGridmasterAccounts,
  forceLogoutGridmasterUser,
  promoteGridmasterAccount,
  updateGridmasterAccountActivation,
} from "@/features/gridmaster/client";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { sectionStyle } from "@/lib/styles";
import type { AssignableOrganizationRole, GridmasterAccount, Organization } from "@/types";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { requireCredentialAssurance } from "@/features/account/client";
import {
  gmHeaderStyle,
  gmTableStyle,
  gmTdStyle,
  gmThStyle,
} from "@/components/gridmaster/table-styles";

function StatusBadge({ deactivatedAt }: { deactivatedAt: string | null | undefined }) {
  if (!deactivatedAt) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--dg-radius-xs)",
        background: "var(--dg-color-danger-bg)",
        color: "var(--dg-color-danger)",
        textTransform: "uppercase",
      }}
    >
      Deactivated
    </span>
  );
}

function GridmasterBadge() {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: "var(--dg-radius-xs)",
        background: "var(--dg-color-brand-bg)",
        color: "var(--dg-color-brand)",
        border: "1px solid var(--dg-color-brand-border)",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      Gridmaster
    </span>
  );
}

function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export default function GridmasterAccountsView({
  organizations,
  currentUserId,
}: {
  organizations: Organization[];
  currentUserId: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const stepUp = useStepUpAction();
  const [search, setSearch] = useState("");
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteConfirmEmail, setPromoteConfirmEmail] = useState<string | null>(null);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activationConfirm, setActivationConfirm] = useState<GridmasterAccount | null>(null);
  const [forceLogoutConfirm, setForceLogoutConfirm] = useState<GridmasterAccount | null>(null);
  const [resetConfirm, setResetConfirm] = useState<GridmasterAccount | null>(null);
  const [demoteTarget, setDemoteTarget] = useState<GridmasterAccount | null>(null);
  const [demoteOrgId, setDemoteOrgId] = useState(organizations[0]?.id ?? "");
  const [demoteOrgRole, setDemoteOrgRole] = useState<AssignableOrganizationRole>("user");

  const accountsQuery = useQuery({
    queryKey: queryKeys.gridmaster.accounts(),
    queryFn: fetchGridmasterAccounts,
    staleTime: 30_000,
  });
  const accounts = accountsQuery.data?.accounts ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((account) =>
      [account.email, account.firstName, account.lastName].some((value) =>
        (value ?? "").toLowerCase().includes(q),
      ),
    );
  }, [accounts, search]);

  function invalidateGridmasterQueries(orgId?: string) {
    queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.accounts() });
    queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.allUsers() });
    queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.dashboard() });
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.orgUsers(orgId) });
    }
  }

  function handlePromote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = promoteEmail.trim();
    if (!email) return;
    setPromoteConfirmEmail(email);
  }

  async function handleConfirmPromote() {
    if (!promoteConfirmEmail) return;
    setPromoteLoading(true);
    try {
      await promoteGridmasterAccount(promoteConfirmEmail);
      toast.success("Gridmaster account promoted");
      setPromoteEmail("");
      setPromoteConfirmEmail(null);
      invalidateGridmasterQueries();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't promote account. Try again."));
    } finally {
      setPromoteLoading(false);
    }
  }

  async function handleDemote() {
    if (!demoteTarget || !demoteOrgId) return;
    setActionLoading(demoteTarget.id);
    try {
      await demoteGridmasterAccount({
        userId: demoteTarget.id,
        orgId: demoteOrgId,
        orgRole: demoteOrgRole,
      });
      toast.success("Gridmaster account demoted");
      setDemoteTarget(null);
      invalidateGridmasterQueries(demoteOrgId);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't demote account. Try again."));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleActivation(account: GridmasterAccount) {
    setActionLoading(account.id);
    const deactivate = !account.deactivatedAt;
    try {
      await updateGridmasterAccountActivation({ userId: account.id, deactivate });
      toast.success(
        deactivate ? "Gridmaster account deactivated" : "Gridmaster account reactivated",
      );
      setActivationConfirm(null);
      invalidateGridmasterQueries();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't update account. Try again."));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleForceLogout(account: GridmasterAccount) {
    setActionLoading(account.id);
    try {
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        await forceLogoutGridmasterUser(account.id, accessToken);
      });
      if (!completed) return;
      toast.success("Gridmaster sessions terminated");
      setForceLogoutConfirm(null);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't force logout. Try again."));
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePasswordReset(account: GridmasterAccount) {
    if (!account.email) return;
    setActionLoading(account.id);
    try {
      const res = await fetch("/api/gridmaster/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          formatClientErrorMessage(body.error, "We couldn't send that password reset."),
        );
      }
      toast.success(`Password reset email sent to ${account.email}`);
      setResetConfirm(null);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't send that password reset."));
    } finally {
      setActionLoading(null);
    }
  }

  if (accountsQuery.isLoading) {
    return (
      <div>
        <div className="dg-skeleton dg-skeleton--heading" style={{ marginBottom: 16 }} />
        <div style={sectionStyle}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                padding: "12px 14px",
                borderBottom: "1px solid var(--dg-color-border-light)",
              }}
            >
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "30%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "16%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "18%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "36%" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <h2
        style={{
          margin: "0 0 16px",
          fontSize: "var(--dg-type-page-title-size)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Gridmaster Accounts
      </h2>

      {accountsQuery.error instanceof Error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--dg-color-danger-bg)",
            color: "var(--dg-color-danger)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {formatClientErrorMessage(
            accountsQuery.error,
            "We couldn't load gridmaster accounts. Refresh and try again.",
          )}
        </div>
      )}

      <Form
        onSubmit={handlePromote}
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}
      >
        <input
          className="dg-input"
          type="email"
          value={promoteEmail}
          onChange={(event) => setPromoteEmail(event.target.value)}
          placeholder="Promote by email"
          aria-label="Promote by email"
          style={{ maxWidth: 300, fontSize: "var(--dg-fs-label)" }}
        />
        <button
          className="dg-btn dg-btn-primary"
          type="submit"
          disabled={promoteLoading || !promoteEmail.trim()}
        >
          <ButtonLoading loading={promoteLoading}>Promote</ButtonLoading>
        </button>
        <div style={{ flex: 1 }} />
        <span
          aria-live="polite"
          style={{
            fontSize: "var(--dg-fs-caption)",
            color: "var(--dg-color-text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          Showing {filtered.length} of {accounts.length}
        </span>
        <div style={{ position: "relative", maxWidth: 220 }}>
          <input
            className="dg-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search gridmaster accounts"
            style={{
              width: "100%",
              paddingRight: search ? 30 : undefined,
              fontSize: "var(--dg-fs-caption)",
            }}
          />
          {search && (
            <CloseButton
              size="sm"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
            />
          )}
        </div>
      </Form>

      {filtered.length > 0 ? (
        <div style={sectionStyle}>
          <div style={{ overflowX: "auto" }}>
            <table style={gmTableStyle}>
              <thead>
                <tr>
                  <th style={gmHeaderStyle("Email")}>Email</th>
                  <th style={gmHeaderStyle("Role")}>Role</th>
                  <th style={gmHeaderStyle("Last login")}>Last login</th>
                  <th style={gmHeaderStyle("Date joined")}>Date joined</th>
                  <th style={gmHeaderStyle("Actions")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => {
                  const isSelf = account.id === currentUserId;
                  const isLoading = actionLoading === account.id;
                  return (
                    <tr key={account.id} style={{ opacity: account.deactivatedAt ? 0.6 : 1 }}>
                      <td
                        style={{ ...gmTdStyle, fontWeight: 600, fontSize: "var(--dg-fs-caption)" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          {account.email ?? "—"}
                          <StatusBadge deactivatedAt={account.deactivatedAt} />
                          {isSelf && (
                            <span
                              style={{
                                fontSize: "var(--dg-fs-footnote)",
                                color: "var(--dg-color-text-muted)",
                              }}
                            >
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={gmTdStyle}>
                        <GridmasterBadge />
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        <MaybeHint
                          content={
                            account.lastSignInAt
                              ? new Date(account.lastSignInAt).toLocaleString()
                              : "Never"
                          }
                          side="bottom"
                        >
                          <span>{formatRelativeDate(account.lastSignInAt)}</span>
                        </MaybeHint>
                      </td>
                      <td
                        style={{
                          ...gmTdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-dm-mono), monospace",
                        }}
                      >
                        {new Date(account.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td style={gmTdStyle}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Button
                            className="dg-btn dg-btn-secondary"
                            style={{ fontSize: "var(--dg-fs-caption)" }}
                            onClick={() => setForceLogoutConfirm(account)}
                            disabled={isSelf || isLoading}
                          >
                            Force Logout
                          </Button>
                          {account.email && (
                            <Button
                              className="dg-btn dg-btn-secondary"
                              style={{ fontSize: "var(--dg-fs-caption)" }}
                              onClick={() => setResetConfirm(account)}
                              disabled={isLoading}
                            >
                              Reset Password
                            </Button>
                          )}
                          <Button
                            className="dg-btn dg-btn-secondary"
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              color: account.deactivatedAt
                                ? "var(--dg-color-success, green)"
                                : "var(--dg-color-warning, orange)",
                            }}
                            onClick={() => setActivationConfirm(account)}
                            disabled={isSelf || isLoading}
                          >
                            {account.deactivatedAt ? "Reactivate" : "Deactivate"}
                          </Button>
                          <Button
                            className="dg-btn dg-btn-secondary"
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-danger)",
                            }}
                            onClick={() => {
                              setDemoteTarget(account);
                              setDemoteOrgId(organizations[0]?.id ?? "");
                              setDemoteOrgRole("user");
                            }}
                            disabled={isSelf || isLoading || organizations.length === 0}
                          >
                            Demote
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M19 8l2 2 4-4" />
            </svg>
          }
          title="No gridmaster accounts found"
          description="Gridmaster accounts are managed separately from organization users."
        />
      )}

      {activationConfirm && (
        <ConfirmDialog
          title={
            activationConfirm.deactivatedAt ? "Reactivate Gridmaster" : "Deactivate Gridmaster"
          }
          message={
            activationConfirm.deactivatedAt
              ? `Reactivate "${activationConfirm.email}"? They will regain gridmaster access.`
              : `Deactivate "${activationConfirm.email}"? They will be blocked from gridmaster access.`
          }
          confirmLabel={activationConfirm.deactivatedAt ? "Reactivate" : "Deactivate"}
          variant={activationConfirm.deactivatedAt ? "info" : "danger"}
          isLoading={actionLoading === activationConfirm.id}
          onConfirm={() => handleActivation(activationConfirm)}
          onCancel={() => setActivationConfirm(null)}
        />
      )}

      {forceLogoutConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Force logout"
          message={`Terminate all sessions for "${forceLogoutConfirm.email}"? They will need to log in again.`}
          confirmLabel="Force logout"
          variant="danger"
          isLoading={actionLoading === forceLogoutConfirm.id}
          onConfirm={() => handleForceLogout(forceLogoutConfirm)}
          onCancel={() => setForceLogoutConfirm(null)}
        />
      )}
      {stepUp.dialog}

      {resetConfirm && (
        <ConfirmDialog
          title="Send Password Reset"
          message={`Send a password reset email to "${resetConfirm.email}"?`}
          confirmLabel="Send reset email"
          variant="info"
          isLoading={actionLoading === resetConfirm.id}
          onConfirm={() => handlePasswordReset(resetConfirm)}
          onCancel={() => setResetConfirm(null)}
        />
      )}

      {promoteConfirmEmail && (
        <ConfirmDialog
          title="Promote Gridmaster"
          message={`Promote "${promoteConfirmEmail}" to platform gridmaster? This grants access to gridmaster oversight tools.`}
          confirmLabel="Promote"
          variant="warning"
          isLoading={promoteLoading}
          onConfirm={handleConfirmPromote}
          onCancel={() => setPromoteConfirmEmail(null)}
        />
      )}

      {demoteTarget && (
        <Modal
          title="Demote Gridmaster"
          onClose={() => setDemoteTarget(null)}
          style={{ maxWidth: 460 }}
        >
          <p
            style={{
              margin: "0 0 16px",
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-muted)",
            }}
          >
            Move {demoteTarget.email ?? "this account"} into an organization as a normal org user.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <label
              style={{
                display: "grid",
                gap: 6,
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
              }}
            >
              Organization
              <CustomSelect
                value={demoteOrgId}
                options={organizations.map((org) => ({ value: org.id, label: org.name }))}
                onChange={setDemoteOrgId}
                style={{ width: "100%" }}
              />
            </label>
            <label
              style={{
                display: "grid",
                gap: 6,
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
              }}
            >
              Organization Role
              <CustomSelect
                value={demoteOrgRole}
                options={[
                  { value: "user", label: "User" },
                  { value: "admin", label: "Admin" },
                  { value: "super_admin", label: "Super Admin" },
                ]}
                onChange={(value) => setDemoteOrgRole(value as AssignableOrganizationRole)}
                style={{ width: "100%" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <Button className="dg-btn dg-btn-secondary" onClick={() => setDemoteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="dg-btn dg-btn-danger"
              onClick={handleDemote}
              disabled={!demoteOrgId || actionLoading === demoteTarget.id}
            >
              <ButtonLoading loading={actionLoading === demoteTarget.id}>Demote</ButtonLoading>
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
