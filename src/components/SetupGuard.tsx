"use client";

import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";
import { useLogout } from "@/hooks";

/**
 * Guards protected pages (dashboard, schedule) from being accessed
 * before the organization is fully set up.
 *
 * - Gridmaster users: guard is skipped (no org)
 * - Super admin / admin: handled by OnboardingGate's inline wizard
 * - Regular users on incomplete org: shown a "setup pending" message
 * - Complete org: children rendered normally
 */
export default function SetupGuard({ children }: { children: React.ReactNode }) {
  const perms = usePermissions();
  const { setupStatus, loading: orgLoading, org } = useOrganizationData();
  const { employees, loading: empLoading } = useEmployees(perms.orgId ?? org?.id ?? null);
  const { signOutLocal } = useLogout();

  const isLoading = orgLoading || empLoading || perms.isLoading;
  const hasEmployees = employees.length > 0;
  const isComplete = setupStatus.isComplete && hasEmployees;
  const hasCachedOrgData = !!org && !orgLoading;
  const isGridmasterBypass = perms.isGridmaster && !perms.isImpersonating;

  // Gridmaster users have no org — skip the guard entirely
  if (isGridmasterBypass) {
    return <>{children}</>;
  }

  // Show children immediately if setup is complete, or if we have cached org
  // data and are just revalidating (avoids blank screen on navigation).
  if (isComplete || (isLoading && hasCachedOrgData && hasEmployees)) return <>{children}</>;
  if (isLoading) return null;

  // Regular user — show waiting message
  if (!perms.isSuperAdmin && !perms.canManageOrg) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          padding: 32,
          gap: 24,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--color-primary, #2563EB)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: "0 0 12px",
              letterSpacing: "-0.02em",
            }}
          >
            Setup in Progress
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--color-text-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Your admin is still configuring the workspace. Try refreshing in a few minutes.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "none",
              background: "var(--color-primary, #2563EB)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
          <button
            onClick={() => signOutLocal()}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-card, white)",
              color: "var(--color-text-primary)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Admin/super_admin on incomplete org — OnboardingGate handles the wizard,
  // but if they somehow get past it, render children rather than blocking.
  return <>{children}</>;
}
