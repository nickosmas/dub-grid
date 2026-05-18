"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { refreshBrowserSession } from "@/features/account/client/auth";
import { buildSubdomainHost, parseHost } from "@/lib/subdomain";

function buildOrgUrl(slug: string | null, path: string): string {
  if (typeof window === "undefined") return path;
  const parsed = parseHost(window.location.host);
  if (!slug) return path;
  return `${window.location.protocol}//${buildSubdomainHost(slug, parsed)}${path}`;
}

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
            "We couldn't enter sandbox mode right now.",
          ),
        );
        setIsLoading(false);
        return;
      }
      // Flush the stale JWT so the next page load sees the sandbox org claims.
      await refreshBrowserSession();
      const sandbox = (body?.sandbox as Record<string, unknown> | undefined) ?? null;
      const org = (sandbox?.org as Record<string, unknown> | undefined) ?? null;
      const slug = typeof org?.slug === "string" ? org.slug : null;
      window.location.assign(buildOrgUrl(slug, "/schedule"));
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setIsLoading(false);
    }
  }

  const sourceLabel = orgName ? ` ${orgName}` : " your workspace";
  const message = (
    <div>
      <p style={{ margin: "0 0 12px 0" }}>
        Sandbox mode gives you a private, fully-isolated copy of{sourceLabel} to
        experiment in. You can create, edit, publish, and delete anything — none
        of it touches your real data.
      </p>
      <p style={{ margin: "0 0 12px 0" }}>
        When you&rsquo;re done, exit the sandbox from the banner at the top of
        the screen and everything is discarded. No cleanup, no leftover copies.
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
