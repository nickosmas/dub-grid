"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchOrganizationBootstrap,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";
import { queryKeys } from "@/lib/query-keys";
import { formatClientErrorMessage } from "@/lib/client-facing";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const expires = new Date(iso).getTime();
  if (Number.isNaN(expires)) return null;
  const diffMs = expires - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export default function SandboxBanner() {
  const bootstrapQuery = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(null, false),
    queryFn: () => fetchOrganizationBootstrap({ includeAssignments: false }),
    staleTime: 60_000,
  });
  const [pending, setPending] = useState<"reset" | "exit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const org = bootstrapQuery.data?.org ?? null;
  if (!org || org.workspaceKind !== "sandbox") return null;

  const days = daysUntil(org.sandboxExpiresAt);
  const expiryLabel =
    days == null
      ? "expiry unknown"
      : days === 0
        ? "expires today"
        : days === 1
          ? "expires in 1 day"
          : `expires in ${days} days`;

  async function handleReset() {
    if (!org) return;
    setPending("reset");
    setError(null);
    try {
      const response = await fetch("/api/test-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", sandboxOrgId: org.id }),
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(
          formatClientErrorMessage(
            body?.error,
            "We couldn't reset the sandbox right now.",
          ),
        );
        setPending(null);
        return;
      }
      window.location.assign("/schedule");
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setPending(null);
    }
  }

  async function handleExit() {
    if (!org) return;
    const target = org.sandboxSourceOrgId;
    if (!target) {
      setError("Source workspace is unavailable. Switch from your account menu.");
      return;
    }
    setPending("exit");
    setError(null);
    try {
      const response = await fetch("/api/auth/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrgId: target }),
      });
      if (!response.ok) {
        const body = (await response.json()) as Record<string, unknown>;
        setError(
          formatClientErrorMessage(
            body?.error,
            "We couldn't exit the sandbox right now.",
          ),
        );
        setPending(null);
        return;
      }
      window.location.assign("/schedule");
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setPending(null);
    }
  }

  const ariaLabel = `Test sandbox, ${expiryLabel}`;

  return (
    <div
      role="status"
      aria-label={ariaLabel}
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
          You&rsquo;re in a test sandbox — {expiryLabel}.
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {error ? (
          <span style={{ fontWeight: 500, opacity: 0.85 }}>{error}</span>
        ) : null}
        <button
          type="button"
          onClick={handleReset}
          disabled={pending != null}
          className="dg-btn dg-btn-secondary"
          style={{ minHeight: 28, padding: "0 10px", fontSize: "var(--dg-fs-caption)" }}
        >
          {pending === "reset" ? "Resetting…" : "Reset"}
        </button>
        <button
          type="button"
          onClick={handleExit}
          disabled={pending != null}
          className="dg-btn dg-btn-primary"
          style={{ minHeight: 28, padding: "0 10px", fontSize: "var(--dg-fs-caption)" }}
        >
          {pending === "exit" ? "Exiting…" : "Exit sandbox"}
        </button>
      </div>
    </div>
  );
}
