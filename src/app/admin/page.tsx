"use client";

import { usePermissions } from "@/hooks";
import ImpersonationPanel from "@/components/ImpersonationPanel";

export default function AdminPage() {
  const { isGridmaster, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <span style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Loading...</span>
      </div>
    );
  }

  if (!isGridmaster) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 520 }}>
          <h1 style={{ marginBottom: 8, fontSize: 24, color: "#B91C1C" }}>Access denied</h1>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            The gridmaster command center is restricted to gridmaster accounts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", padding: 24 }}>
      <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26, color: "var(--color-text-secondary)" }}>
          Gridmaster Command Center
        </h1>

        <div
          style={{
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 16 }}>User Impersonation</h2>
          <ImpersonationPanel />
        </div>
      </div>
    </div>
  );
}
