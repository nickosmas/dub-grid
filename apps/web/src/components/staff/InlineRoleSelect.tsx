"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { OrganizationRole } from "@/types";
import { SELF_ACTION_FORBIDDEN_MESSAGE } from "@dubgrid/domain";
import CustomSelect from "@/components/CustomSelect";
import { MaybeHint } from "@/components/ui/hint";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { ORG_ROLE_LABELS, getOrgRoleBadgeStyle } from "./org-role-badges";

const ROLE_OPTIONS: { value: OrganizationRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

/**
 * Role dropdown for a directory table cell. When `onChange` is omitted (viewer
 * can't manage access, or the person has no login) it falls back to a read-only
 * badge / em dash. Stops row-click propagation so interacting with the select
 * doesn't open the row's detail panel.
 */
export function InlineRoleSelect({
  orgRole,
  onChange,
  isSelf = false,
  pendingInvitationEmail,
}: {
  orgRole: OrganizationRole | null | undefined;
  onChange?: (newRole: OrganizationRole, accessToken?: string) => Promise<void>;
  isSelf?: boolean;
  pendingInvitationEmail?: string;
}) {
  const [pending, setPending] = useState<OrganizationRole | null>(null);
  const [saving, setSaving] = useState(false);
  const stepUp = useStepUpAction();

  // Self can't change own role: show the dropdown in its disabled state so
  // the Access column reads consistently across rows. The hint explains why.
  if (orgRole && isSelf) {
    return (
      <MaybeHint content={SELF_ACTION_FORBIDDEN_MESSAGE}>
        <div onClick={(event) => event.stopPropagation()} style={{ minWidth: 132, maxWidth: 168 }}>
          <CustomSelect
            value={orgRole}
            disabled
            onChange={() => undefined}
            options={ROLE_OPTIONS}
          />
        </div>
      </MaybeHint>
    );
  }

  // No edit permission / no login: read-only badge or em dash.
  if (!orgRole || !onChange) {
    return orgRole ? (
      <span
        className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--dg-type-badge-size)] font-medium"
        style={getOrgRoleBadgeStyle(orgRole)}
      >
        {ORG_ROLE_LABELS[orgRole]}
      </span>
    ) : (
      <span className="text-[12px] text-[var(--dg-color-text-muted)]">{"—"}</span>
    );
  }

  return (
    <div onClick={(event) => event.stopPropagation()} style={{ minWidth: 132, maxWidth: 168 }}>
      <CustomSelect
        value={orgRole}
        disabled={saving}
        onChange={(value) => {
          if (value !== orgRole) setPending(value);
        }}
        options={ROLE_OPTIONS}
      />
      {pending && !stepUp.dialog && (
        <ConfirmDialog
          title={pendingInvitationEmail ? "Change invitation access?" : "Change role"}
          message={
            pendingInvitationEmail
              ? `Change access from ${ORG_ROLE_LABELS[orgRole]} to ${ORG_ROLE_LABELS[pending]}? Their current invite link stops working immediately, and a new one is sent to ${pendingInvitationEmail}.`
              : `Change this person's role to ${ORG_ROLE_LABELS[pending]}? Their access updates immediately.`
          }
          confirmLabel={pendingInvitationEmail ? "Change and resend" : "Change role"}
          variant="warning"
          isLoading={saving}
          onCancel={() => {
            if (saving) return;
            setPending(null);
          }}
          onConfirm={async () => {
            const next = pending;
            setSaving(true);
            try {
              const completed = await stepUp.run((accessToken) => onChange(next, accessToken));
              if (!completed) {
                setPending(null);
                return;
              }
              toast.success(
                pendingInvitationEmail
                  ? `Invitation replaced with ${ORG_ROLE_LABELS[next]} access.`
                  : `Role updated to ${ORG_ROLE_LABELS[next]}.`,
              );
              setPending(null);
            } catch (error) {
              toast.error(
                formatClientErrorMessage(error, "We couldn't change that role. Try again."),
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
      {stepUp.dialog}
    </div>
  );
}
