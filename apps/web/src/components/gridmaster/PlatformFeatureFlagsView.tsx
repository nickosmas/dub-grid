"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createPlatformFeatureFlag,
  fetchPlatformFeatureFlags,
  updatePlatformFeatureFlag,
} from "@/features/gridmaster/client";
import { Switch } from "@/components/ui/switch";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { formatClientErrorMessage, formatClientLabel } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle } from "@/lib/styles";
import type { PlatformFeatureFlag } from "@/types";

// Plain-language label + explanation for each flag, shown instead of the raw
// database key/description (which are written for engineers debugging a
// route, not for someone deciding whether to flip a switch). Falls back to a
// title-cased key and the server's own description for any flag added here
// later without an entry below, so nothing renders blank.
const FLAG_INFO: Record<string, { label: string; description: string }> = {
  stripe: {
    label: "Billing & Checkout",
    description:
      "Payments, checkout, and the billing portal for every organization. Turning this off stops any organization from starting or managing a paid plan.",
  },
  sentry: {
    label: "Error Reporting",
    description:
      "Sends crash and error reports to the engineering team. Turning this off doesn't affect any organization, it only stops error tracking.",
  },
  posthog: {
    label: "Product Analytics",
    description:
      "Collects product usage data for the team. Turning this off doesn't affect any organization, it only stops analytics collection.",
  },
  resend_email: {
    label: "Outbound Email",
    description:
      "Sends invitations, notifications, and billing emails to organizations. Turning this off means those emails silently fail to send, though the action that triggers them (like inviting someone) still works.",
  },
  csv_import: {
    label: "Employee CSV Import",
    description:
      "Lets organizations bulk-import employees from a spreadsheet. Turning this off disables the Import button for everyone.",
  },
  csv_export: {
    label: "CSV Export",
    description:
      "Lets organizations export staff and schedule data as a spreadsheet. Turning this off disables the Export button for everyone.",
  },
  mobile_api: {
    label: "Mobile App",
    description:
      "Powers the entire mobile app. Turning this off makes the mobile app completely unusable for every organization until it's turned back on — use with caution.",
  },
  cron_trial_expiry: {
    label: "Trial Expiry Reminders",
    description:
      "A daily background job that emails organizations about expiring trials. Turning this off pauses those reminders; nothing breaks for users.",
  },
  cron_expire_requests: {
    label: "Shift Request Auto-Expiry",
    description:
      "A background job that automatically closes old, unanswered shift requests. Turning this off means unanswered requests stay open instead of expiring automatically.",
  },
  cron_reconcile_org_domains: {
    label: "Organization Domain Sync",
    description:
      "A background job that keeps organization subdomains in sync. Safe to turn off temporarily, there's no immediate user-facing effect.",
  },
  cron_sandbox_cleanup: {
    label: "Sandbox Cleanup",
    description:
      "A background job that clears out old test-sandbox data. Turning this off just delays cleanup; it doesn't affect sandboxes in use.",
  },
  reports: {
    label: "Reports",
    description:
      "The Reports page and its exports for every organization. Turning this off hides the Reports tab and blocks report generation for everyone.",
  },
  printing: {
    label: "Schedule Printing",
    description:
      "The print-schedule option in the schedule toolbar. Turning this off hides that option; it does not affect a browser's own Ctrl+P print.",
  },
};

const KEY_FORMAT_ERROR = "Use lowercase letters, numbers, and underscores only.";
const KEY_FORMAT_PATTERN = /^[a-z0-9_]+$/;

function getFlagInfo(flag: PlatformFeatureFlag): { label: string; description: string } {
  return (
    FLAG_INFO[flag.key] ?? { label: formatClientLabel(flag.key), description: flag.description }
  );
}

export default function PlatformFeatureFlagsView() {
  const queryClient = useQueryClient();
  const [pendingFlag, setPendingFlag] = useState<PlatformFeatureFlag | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newEnabled, setNewEnabled] = useState(true);

  const flagsQuery = useQuery({
    queryKey: queryKeys.gridmaster.platformFlags(),
    queryFn: fetchPlatformFeatureFlags,
  });

  const mutation = useMutation({
    mutationFn: updatePlatformFeatureFlag,
    onSuccess: () => {
      toast.success("Feature updated");
      void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.platformFlags() });
    },
    onError: (err: unknown) => {
      toast.error(formatClientErrorMessage(err, "Failed to update feature"));
      void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.platformFlags() });
    },
    onSettled: () => setPendingFlag(null),
  });

  const createMutation = useMutation({
    mutationFn: createPlatformFeatureFlag,
    onSuccess: () => {
      toast.success("Feature control added");
      void queryClient.invalidateQueries({ queryKey: queryKeys.gridmaster.platformFlags() });
      closeAddModal();
    },
    onError: (err: unknown) => {
      toast.error(formatClientErrorMessage(err, "Failed to add feature control"));
    },
  });

  const flags = flagsQuery.data?.flags ?? [];
  const pendingInfo = pendingFlag ? getFlagInfo(pendingFlag) : null;
  const existingKeys = new Set(flags.map((flag) => flag.key));
  const suggestedKeys = Object.keys(FLAG_INFO).filter((key) => !existingKeys.has(key));
  const keyError = newKey.length > 0 && !KEY_FORMAT_PATTERN.test(newKey) ? KEY_FORMAT_ERROR : null;

  function closeAddModal() {
    setAddModalOpen(false);
    setNewKey("");
    setNewDescription("");
    setNewEnabled(true);
  }

  function openAddModal(prefill?: { key: string; description: string }) {
    setNewKey(prefill?.key ?? "");
    setNewDescription(prefill?.description ?? "");
    setNewEnabled(true);
    setAddModalOpen(true);
  }

  function handleCreateSubmit() {
    if (!newKey.trim() || !newDescription.trim() || keyError) return;
    createMutation.mutate({
      key: newKey.trim(),
      description: newDescription.trim(),
      enabled: newEnabled,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={sectionStyle}>
        <div
          style={{
            ...sectionHeaderStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          Platform Feature Controls
          <button className="dg-btn dg-btn-secondary dg-btn-sm" onClick={() => openAddModal()}>
            + Add Feature Control
          </button>
        </div>
        {suggestedKeys.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              padding: "14px 20px 0",
            }}
          >
            <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
              Quick add:
            </span>
            {suggestedKeys.map((key) => (
              <button
                key={key}
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={() => openAddModal({ key, description: FLAG_INFO[key].description })}
              >
                + {FLAG_INFO[key].label}
              </button>
            ))}
          </div>
        )}
        <div style={sectionBodyStyle}>
          {flagsQuery.isLoading ? (
            <div style={{ color: "var(--color-text-muted)" }}>Loading feature controls…</div>
          ) : flags.length === 0 ? (
            <EmptyState
              size="compact"
              title="No feature controls configured"
              description="Platform-wide feature controls will appear here once they're set up."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {flags.map((flag, index) => {
                const info = getFlagInfo(flag);
                return (
                  <div
                    key={flag.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "14px 0",
                      borderTop: index === 0 ? undefined : "1px solid var(--color-border-light)",
                    }}
                  >
                    <Switch
                      checked={flag.enabled}
                      disabled={mutation.isPending}
                      ariaLabel={`${info.label}: ${info.description}`}
                      onChange={() => setPendingFlag(flag)}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 8,
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {info.label}
                        <span
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            fontWeight: 400,
                            fontFamily: "var(--font-mono, monospace)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {flag.key}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {info.description}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        fontWeight: 600,
                        color: flag.enabled
                          ? "var(--color-success-text)"
                          : "var(--color-danger-text)",
                      }}
                    >
                      {flag.enabled ? "On" : "Off"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {pendingFlag && pendingInfo && (
        <ConfirmDialog
          title={
            pendingFlag.enabled
              ? `Turn Off "${pendingInfo.label}"?`
              : `Turn On "${pendingInfo.label}"?`
          }
          message={
            pendingFlag.enabled
              ? `This affects every organization on the platform immediately. ${pendingInfo.description}`
              : `This restores it for every organization on the platform immediately. ${pendingInfo.description}`
          }
          confirmLabel={pendingFlag.enabled ? "Turn It Off" : "Turn It On"}
          variant={pendingFlag.enabled ? "danger" : "warning"}
          isLoading={mutation.isPending}
          onConfirm={() => {
            mutation.mutate({
              key: pendingFlag.key,
              enabled: !pendingFlag.enabled,
              expectedUpdatedAt: pendingFlag.updatedAt,
            });
          }}
          onCancel={() => setPendingFlag(null)}
        />
      )}

      {addModalOpen && (
        <Modal title="Add Feature Control" onClose={closeAddModal} style={{ maxWidth: 480 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                Key
              </span>
              <input
                className="dg-input"
                value={newKey}
                onChange={(event) => setNewKey(event.target.value.toLowerCase())}
                placeholder="e.g. reports"
                autoFocus
              />
              <span
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  color: keyError ? "var(--color-danger-text)" : "var(--color-text-muted)",
                }}
              >
                {keyError ??
                  "Lowercase letters, numbers, and underscores only. Must match exactly what the code checks for."}
              </span>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                }}
              >
                Description
              </span>
              <textarea
                className="dg-input"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="What this controls, and what turning it off affects"
                rows={3}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={newEnabled}
                onChange={(event) => setNewEnabled(event.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-primary)" }}>
                Start enabled
              </span>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button className="dg-btn dg-btn-secondary" onClick={closeAddModal}>
              Cancel
            </button>
            <button
              className="dg-btn dg-btn-primary"
              onClick={handleCreateSubmit}
              disabled={
                createMutation.isPending || !newKey.trim() || !newDescription.trim() || !!keyError
              }
            >
              {createMutation.isPending ? "Adding..." : "Add Feature Control"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
