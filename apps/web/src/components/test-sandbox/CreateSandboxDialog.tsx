"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatClientErrorMessage } from "@/lib/client-facing";

interface CreateSandboxDialogProps {
  orgName?: string;
  onClose: () => void;
}

export default function CreateSandboxDialog({
  orgName,
  onClose,
}: CreateSandboxDialogProps) {
  const queryClient = useQueryClient();
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
          formatClientErrorMessage(
            body?.error,
            "We couldn't enter sandbox mode right now.",
          ),
        );
        setIsLoading(false);
        return;
      }
      // The sandbox cookie was set by the server response. No navigation —
      // middleware reads the cookie on the next request and overrides
      // org_id. clear() purges any pre-sandbox cache so the page can't
      // briefly show real-org data after the AppShell remount; the
      // subsequent invalidateQueries kicks off fresh fetches for any
      // query that still has active subscribers.
      queryClient.clear();
      await queryClient.invalidateQueries();
      onClose();
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
        &nbsp;you can experiment in. Create, edit, publish, delete — none of it
        touches your real data.
      </p>
      <p style={{ margin: "0 0 12px 0" }}>
        You stay signed in on this same page. Exit at any time from the banner
        at the top of the screen and everything is discarded.
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
      confirmLabel={isLoading ? "Entering…" : "Enter sandbox"}
      cancelLabel="Cancel"
      variant="info"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
