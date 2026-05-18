"use client";

import { useState } from "react";
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/test-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(
          formatClientErrorMessage(
            body?.error,
            "We couldn't open the test sandbox right now.",
          ),
        );
        setIsLoading(false);
        return;
      }
      window.location.assign("/schedule");
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setIsLoading(false);
    }
  }

  const sourceLabel = orgName ? ` from ${orgName}` : "";
  const message = (
    <div>
      <p style={{ margin: "0 0 12px 0" }}>
        A test sandbox is a temporary copy of your workspace{sourceLabel}. It is
        seeded with a small set of fake people and shifts so you can try out
        scheduling, publishing, and other changes without affecting your live
        data.
      </p>
      <p style={{ margin: "0 0 12px 0" }}>
        Sandboxes expire 30 days after creation. You can reset or exit at any
        time from the banner at the top of the screen.
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
      title="Open test sandbox"
      message={message}
      confirmLabel={isLoading ? "Creating sandbox…" : "Create sandbox"}
      cancelLabel="Cancel"
      variant="info"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
