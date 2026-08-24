"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchOrganizationBootstrap,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/Button";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { ButtonLoading } from "@/components/ButtonSpinner";

export default function SandboxBanner() {
  const bootstrapQuery = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(),
    queryFn: () => fetchOrganizationBootstrap(),
    staleTime: 60_000,
  });
  const [pendingAction, setPendingAction] = useState<"exit" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const org = bootstrapQuery.data?.org ?? null;
  if (!org || org.workspaceKind !== "sandbox") return null;

  async function postSandboxAction(action: "exit" | "reset", errorFallback: string) {
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
      // Hard-reload on exit and reset.
      //
      // We tried two softer approaches first — queryClient.invalidate
      // alone, then queryClient.clear() + invalidate + an AppShell
      // keyed remount — and both still left stale values in components
      // whose state lives outside React Query (settings forms that
      // hydrate local useState from props on mount, custom-labels-style
      // forms that snapshot data into local refs, context providers
      // that cache lookups, etc.). Forcing a same-page reload is the
      // only way to guarantee every component's local state is reset
      // when the active org id changes, without trying to enumerate
      // every form's hydration pattern.
      //
      // Same-page reload, not a navigation — the URL stays put, so
      // this doesn't feel like a logout. The cookie was cleared
      // (exit) or rewritten (reset) by the server response, so the
      // reloaded page sees the new sandbox state on its first
      // bootstrap fetch.
      window.location.reload();
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setPendingAction(null);
    }
  }

  const handleExit = () => postSandboxAction("exit", "We couldn't exit sandbox mode right now.");
  const handleReset = () => postSandboxAction("reset", "We couldn't reset the sandbox right now.");

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
        background: "var(--color-danger)",
        borderBottom: "1px solid var(--color-danger-dark)",
        color: "var(--color-text-inverse)",
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
            border: "1.5px solid currentColor",
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
          You&rsquo;re in sandbox mode — changes won&rsquo;t affect your real organization.
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {error ? <span style={{ fontWeight: 500, opacity: 0.85 }}>{error}</span> : null}
        <Button
          type="button"
          onClick={handleReset}
          disabled={pendingAction != null}
          className="dg-btn dg-btn-on-danger-outline"
          title="Discard all sandbox changes and start over with a fresh clone of your organization."
          style={{
            minHeight: 28,
            padding: "0 10px",
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          <ButtonLoading loading={pendingAction === "reset"} loadingLabel="Resetting">
            Reset sandbox
          </ButtonLoading>
        </Button>
        <Button
          type="button"
          onClick={handleExit}
          disabled={pendingAction != null}
          className="dg-btn dg-btn-on-danger-solid"
          style={{
            minHeight: 28,
            padding: "0 10px",
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          <ButtonLoading loading={pendingAction === "exit"} loadingLabel="Exiting">
            Exit sandbox
          </ButtonLoading>
        </Button>
      </div>
    </div>
  );
}
