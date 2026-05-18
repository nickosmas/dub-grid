"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchOrganizationBootstrap,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";
import { queryKeys } from "@/lib/query-keys";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { refreshBrowserSession } from "@/features/account/client/auth";

export default function SandboxBanner() {
  const bootstrapQuery = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(null, false),
    queryFn: () => fetchOrganizationBootstrap({ includeAssignments: false }),
    staleTime: 60_000,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const org = bootstrapQuery.data?.org ?? null;
  if (!org || org.workspaceKind !== "sandbox") return null;

  async function handleExit() {
    if (!org) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/test-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exit", sandboxOrgId: org.id }),
      });
      if (!response.ok) {
        const body = (await response.json()) as Record<string, unknown>;
        setError(
          formatClientErrorMessage(
            body?.error,
            "We couldn't exit sandbox mode right now.",
          ),
        );
        setPending(false);
        return;
      }
      // Flush the stale JWT so the next page load sees the source-org claims.
      await refreshBrowserSession();
      window.location.assign("/schedule");
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setPending(false);
    }
  }

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
        background: "var(--color-warning-bg)",
        borderBottom: "1px solid var(--color-warning-border)",
        color: "var(--color-warning)",
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
            border: "1.5px solid var(--color-warning)",
            fontSize: 11,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          !
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
          onClick={handleExit}
          disabled={pending}
          className="dg-btn dg-btn-primary"
          style={{ minHeight: 28, padding: "0 10px", fontSize: "var(--dg-fs-caption)" }}
        >
          {pending ? "Exiting…" : "Exit sandbox"}
        </button>
      </div>
    </div>
  );
}
