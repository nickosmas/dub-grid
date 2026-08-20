"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatClientErrorMessage } from "@/lib/client-facing";

interface CreateSandboxDialogProps {
  orgName?: string;
  onClose: () => void;
}

export default function CreateSandboxDialog({ orgName, onClose }: CreateSandboxDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/test-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enter" }),
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(
          formatClientErrorMessage(body?.error, "We couldn't enter sandbox mode right now."),
        );
        setIsLoading(false);
        return;
      }
      // The sandbox cookie was set by the server response. Hard-reload the
      // same page (URL unchanged, so it doesn't feel like a logout) to
      // guarantee every view resets to the sandbox org: the reloaded page's
      // first bootstrap fetch sees the cookie and returns the sandbox org, so
      // the grid and any form-local state can't keep showing real-org data.
      // This mirrors the exit/reset flow in SandboxBanner — a soft
      // queryClient.clear() + invalidate left stale values in components whose
      // state lives outside React Query (and still showed real-org schedule
      // data until the AppShell remounted).
      window.location.reload();
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setIsLoading(false);
    }
  }

  const sourceLabel = orgName ? ` ${orgName}` : " your organization";
  const message = (
    <div>
      <p style={{ margin: "0 0 12px 0" }}>
        Sandbox mode gives you a private, fully-isolated copy of{sourceLabel}
        &nbsp;you can experiment in. Create, edit, publish, delete — none of it touches your real
        data.
      </p>
      <p style={{ margin: "0 0 12px 0" }}>
        You stay signed in on this same page. Exit at any time from the banner at the top of the
        screen and everything is discarded.
      </p>
      {error ? (
        <div
          role="alert"
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-danger-border)",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );

  return (
    <ConfirmDialog
      title="Enter sandbox mode"
      message={message}
      confirmLabel="Enter sandbox"
      confirmPendingLabel="Entering"
      cancelLabel="Cancel"
      variant="info"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
