"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import CustomSelect from "./CustomSelect";
import { Employee, OrganizationUser } from "@/types";
import type { AssignableOrganizationRole } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import * as db from "@/lib/db";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: "user" as const, label: "User" },
  { value: "admin" as const, label: "Admin" },
];

interface InviteEmployeeModalProps {
  employee: Employee;
  orgId: string;
  orgName: string;
  onClose: () => void;
  onInvited: () => void;
}

type ModalMode = "loading" | "link" | "invite";

export default function InviteEmployeeModal({
  employee,
  orgId,
  orgName,
  onClose,
  onInvited,
}: InviteEmployeeModalProps) {
  const [email, setEmail] = useState(employee.email || "");
  const [role, setRole] = useState<AssignableOrganizationRole>("user");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Existing user detection
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [orgUsersLoaded, setOrgUsersLoaded] = useState(false);

  // On mount, fetch org users
  useEffect(() => {
    db.fetchOrganizationUsers(orgId)
      .then((users) => {
        setOrgUsers(users);
      })
      .catch(() => {
        // fallback — leave empty
      })
      .finally(() => setOrgUsersLoaded(true));
  }, [orgId]);

  // Derive mode and matchedUser inline
  const matchedUser = orgUsersLoaded && email.trim()
    ? orgUsers.find(
        (u) => u.email && u.email.toLowerCase() === email.trim().toLowerCase()
      ) ?? null
    : null;

  const mode: ModalMode = !orgUsersLoaded
    ? "loading"
    : matchedUser
      ? "link"
      : "invite";

  const canSend = email.trim() && email.includes("@") && !sending && !sent;

  async function handleLink() {
    if (!matchedUser) return;
    setSending(true);
    setError(null);

    try {
      await db.linkEmployeeToUser(employee.id, matchedUser.id, orgId);
      toast.success(`${getEmployeeDisplayName(employee)} linked to ${matchedUser.email}`);
      onInvited();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to link user";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setError(null);

    try {
      const { token } = await db.sendInvitation(email.trim(), role, orgId, employee.id);

      // Send the invitation email
      const res = await fetch("/api/send-invite-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: email.trim(), orgName }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to send invitation email");
      }

      toast.success(`Invitation email sent to ${email.trim()}`);
      setSent(true);
      onInvited();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? (err as { message: string }).message
            : "Failed to create invitation";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  const userName = matchedUser
    ? [matchedUser.firstName, matchedUser.lastName].filter(Boolean).join(" ") || matchedUser.email
    : null;

  return (
    <Modal
      title={mode === "link" ? `Link ${getEmployeeDisplayName(employee)}` : `Invite ${getEmployeeDisplayName(employee)}`}
      onClose={onClose}
      style={{ maxWidth: 480 }}
    >
      {mode === "loading" ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--color-text-muted, #4D6080)", fontSize: "var(--dg-fs-body-sm)" }}>
          Checking for existing users...
        </div>
      ) : mode === "link" && matchedUser ? (
        /* Direct link mode — user already exists in this org */
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: "16px",
              background: "var(--color-info-bg)",
              borderRadius: 8,
              border: "1px solid var(--color-info-border)",
            }}
          >
            <p style={{ margin: 0, fontSize: "var(--dg-fs-body-sm)", fontWeight: 600, color: "var(--color-info-text)" }}>
              Existing user found
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "var(--dg-fs-label)", color: "var(--color-info-text)" }}>
              <strong>{userName}</strong> ({matchedUser.email}) is already a member of this
              organization as <strong>{matchedUser.orgRole.replace("_", " ")}</strong>.
              You can link them directly — no invitation needed.
            </p>
          </div>

          {/* Error */}
          {error && <ErrorBanner message={error} />}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="dg-btn dg-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="dg-btn dg-btn-primary"
              onClick={handleLink}
              disabled={sending}
              style={{ opacity: sending ? 0.5 : 1 }}
            >
              {sending ? "Linking..." : `Link to ${userName}`}
            </button>
          </div>
        </div>
      ) : (
        /* Invite mode — new user */
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Employee context */}
          <div
            style={{
              padding: "12px 16px",
              background: "var(--color-bg-hover, #F5F7FA)",
              borderRadius: 8,
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--color-text-secondary, #334766)",
            }}
          >
            Sending an invitation to <strong>{getEmployeeDisplayName(employee)}</strong>. They will
            receive an email with a link to set their password and join your organization.
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@example.com"
              style={inputStyle}
            />
          </div>

          {/* Role */}
          <div>
            <label style={labelStyle}>Role</label>
            <CustomSelect
              value={role}
              options={ROLE_OPTIONS}
              onChange={(v) => setRole(v as AssignableOrganizationRole)}
            />
          </div>

          {/* Error */}
          {error && <ErrorBanner message={error} />}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="dg-btn dg-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="dg-btn dg-btn-primary"
              onClick={handleSend}
              disabled={!canSend}
              style={{ opacity: canSend ? 1 : 0.5 }}
            >
              {sending ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      style={{
        color: "var(--color-danger-dark)",
        fontSize: "var(--dg-fs-body-sm)",
        margin: 0,
        padding: "8px 12px",
        background: "var(--color-danger-bg)",
        borderRadius: 8,
      }}
    >
      {message}
    </p>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--dg-fs-label)",
  fontWeight: 600,
  color: "var(--color-text-secondary, #334766)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--color-border, #C8D6EC)",
  borderRadius: 8,
  fontSize: "var(--dg-fs-body-sm)",
  color: "var(--color-text-primary, #0F1724)",
  background: "var(--color-bg, #fff)",
  outline: "none",
  boxSizing: "border-box",
};
