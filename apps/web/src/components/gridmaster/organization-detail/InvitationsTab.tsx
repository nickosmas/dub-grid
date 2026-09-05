import ConfirmDialog from "@/components/ConfirmDialog";
import {
  InvitationAccessConflictError,
  revokeOrganizationInvitationGuarded,
} from "@/features/organization/client";
import { formatClientErrorMessage, formatOrganizationRoleLabel } from "@/lib/client-facing";
import { Button } from "@/components/Button";
import { sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import { useState } from "react";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";

// Invitations tab for the gridmaster OrganizationDetail view.

export interface InvitationRow {
  id: string;
  org_id: string;
  email: string;
  role_to_assign: string;
  invited_by?: string | null;
  token?: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  updated_at: string | null;
  employee_id?: string | null;
}

export function InvitationsTab({
  invitations,
  orgId,
  onRefresh,
}: {
  invitations: InvitationRow[];
  orgId: string;
  onRefresh: () => void;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<InvitationRow | null>(null);

  function getStatus(inv: InvitationRow): { label: string; color: string; bg: string } {
    if (inv.accepted_at)
      return {
        label: "Accepted",
        color: "var(--dg-color-success)",
        bg: "var(--dg-color-success-bg)",
      };
    if (inv.revoked_at)
      return { label: "Revoked", color: "var(--dg-color-danger)", bg: "var(--dg-color-danger-bg)" };
    if (new Date(inv.expires_at) < new Date())
      return {
        label: "Expired",
        color: "var(--dg-color-warning)",
        bg: "var(--dg-color-warning-bg)",
      };
    return {
      label: "Pending",
      color: "var(--dg-color-today-text)",
      bg: "var(--dg-color-today-bg)",
    };
  }

  async function handleRevoke(inv: InvitationRow) {
    if (!inv.updated_at) {
      toast.error("Invitation data is out of date. Refresh and try again.");
      return;
    }
    setRevoking(inv.id);
    try {
      await revokeOrganizationInvitationGuarded({
        orgId,
        invitationId: inv.id,
        expectedUpdatedAt: inv.updated_at,
      });
      toast.success("Invitation revoked");
      onRefresh();
    } catch (err: unknown) {
      if (err instanceof InvitationAccessConflictError) {
        toast.error("Invitation changed elsewhere. Review the latest values and try again.");
        onRefresh();
      } else {
        toast.error(
          formatClientErrorMessage(err, "We couldn't cancel that invitation. Try again."),
        );
      }
    } finally {
      setRevoking(null);
      setRevokeConfirm(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
          {invitations.length} invitation{invitations.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={sectionStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Sent</th>
                <th style={thStyle}>Expires</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      color: "var(--dg-color-text-muted)",
                      padding: 32,
                    }}
                  >
                    No invitations found
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => {
                  const status = getStatus(inv);
                  const isPending = status.label === "Pending";
                  return (
                    <tr key={inv.id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{inv.email}</td>
                      <td style={tdStyle}>{formatOrganizationRoleLabel(inv.role_to_assign)}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: "var(--dg-fs-footnote)",
                            fontWeight: 600,
                            color: status.color,
                            background: status.bg,
                          }}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                        }}
                      >
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                        }}
                      >
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td style={tdStyle}>
                        {isPending && (
                          <Button
                            className="dg-btn dg-btn-ghost"
                            style={{
                              fontSize: "var(--dg-fs-footnote)",
                              padding: "3px 6px",
                              color: "var(--dg-color-danger)",
                            }}
                            onClick={() => setRevokeConfirm(inv)}
                            disabled={revoking === inv.id}
                          >
                            <ButtonLoading loading={revoking === inv.id}>Revoke</ButtonLoading>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {revokeConfirm && (
        <ConfirmDialog
          title="Revoke Invitation"
          message={`Revoke the invitation for "${revokeConfirm.email}"? They will not be able to use the current invite link after this change.`}
          confirmLabel="Revoke"
          variant="danger"
          isLoading={revoking === revokeConfirm.id}
          onConfirm={() => handleRevoke(revokeConfirm)}
          onCancel={() => setRevokeConfirm(null)}
        />
      )}
    </div>
  );
}
