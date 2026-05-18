"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchOrganizationBootstrap,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";
import { queryKeys } from "@/lib/query-keys";
import { formatClientErrorMessage } from "@/lib/client-facing";

export default function SandboxBanner() {
  const queryClient = useQueryClient();
  const bootstrapQuery = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(null, false),
    queryFn: () => fetchOrganizationBootstrap({ includeAssignments: false }),
    staleTime: 60_000,
  });
  const [pendingAction, setPendingAction] = useState<"exit" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const org = bootstrapQuery.data?.org ?? null;
  if (!org || org.workspaceKind !== "sandbox") return null;

  async function postSandboxAction(
    action: "exit" | "reset",
    errorFallback: string,
  ) {
    setPendingAction(action);
    setError(null);
    try {
      const response = await fetch("/api/test-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = (await response.json()) as Record<string, unknown>;
        setError(formatClientErrorMessage(body?.error, errorFallback));
        setPendingAction(null);
        return;
      }
      // No navigation. Two things must happen for the UI to reflect
      // the org switch cleanly:
      //
      //   1. queryClient.clear() — purge ALL cached data. Without this,
      //      forms re-mount reading stale cached values from the prior
      //      sandbox session (the save mutation cached sandbox results
      //      under the real-org cache key because client code derives
      //      query keys from the unrefreshed JWT's org id).
      //   2. invalidateQueries() — restart fetches for any query that
      //      still has subscribers, so the page repopulates quickly
      //      from the new org context rather than waiting for an idle
      //      moment.
      queryClient.clear();
      await queryClient.invalidateQueries();
      setPendingAction(null);
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setPendingAction(null);
    }
  }

  const handleExit = () =>
    postSandboxAction("exit", "We couldn't exit sandbox mode right now.");
  const handleReset = () =>
    postSandboxAction(
      "reset",
      "We couldn't reset the sandbox right now.",
    );

  return (
    <div
      role="status"
      aria-label="You're in sandbox mode"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "8px 16px",
        background: "var(--color-danger-bg)",
        borderBottom: "1px solid var(--color-danger-border)",
        color: "var(--color-danger)",
        fontSize: "var(--dg-fs-caption)",
        fontWeight: 600,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 9,
            border: "1.5px solid var(--color-danger)",
            fontSize: 11,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          !
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          You&rsquo;re in sandbox mode — changes won&rsquo;t affect your real
          workspace.
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {error ? (
          <span style={{ fontWeight: 500, opacity: 0.85 }}>{error}</span>
        ) : null}
        <button
          type="button"
          onClick={handleReset}
          disabled={pendingAction != null}
          className="dg-btn dg-btn-secondary"
          title="Discard all sandbox changes and start over with a fresh clone of your workspace."
          style={{
            minHeight: 28,
            padding: "0 10px",
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          {pendingAction === "reset" ? "Resetting…" : "Reset sandbox"}
        </button>
        <button
          type="button"
          onClick={handleExit}
          disabled={pendingAction != null}
          className="dg-btn dg-btn-primary"
          style={{
            minHeight: 28,
            padding: "0 10px",
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          {pendingAction === "exit" ? "Exiting…" : "Exit sandbox"}
        </button>
      </div>
    </div>
  );
}
