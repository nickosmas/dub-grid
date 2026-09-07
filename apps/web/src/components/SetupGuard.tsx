"use client";

import { useOrganizationData, usePermissions } from "@/hooks";
import { Button } from "@/components/Button";
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
  const {
    setupStatus,
    loading: orgLoading,
    org,
    activeEmployeeCount,
  } = useOrganizationData({ includeAssignmentDefinitionCompatibility: false });
  const { signOut } = useLogout();

  // Deliberately not gated on useEmployees. This guard only needs to know
  // whether the org has any staff, and the bootstrap fan-out answers that with
  // a count — so the first paint after sign-in no longer sits behind a full
  // roster fetch it never reads.
  const isLoading = orgLoading || perms.isLoading;
  const hasEmployees = activeEmployeeCount > 0;
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
            background: "var(--dg-color-primary, #2563EB)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
              margin: "0 0 12px",
              letterSpacing: "-0.02em",
            }}
          >
            Setup in Progress
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--dg-color-text-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Your admin is still configuring the organization. Try refreshing in a few minutes.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button
            onClick={() => signOut()}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--dg-radius-lg)",
              border: "1px solid var(--dg-color-border)",
              background: "var(--dg-color-surface)",
              color: "var(--dg-color-text-primary)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign Out
          </Button>
          <Button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--dg-radius-lg)",
              border: "none",
              background: "var(--dg-color-primary, #2563EB)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  // Admin/super_admin on incomplete org — OnboardingGate handles the wizard,
  // but if they somehow get past it, render children rather than blocking.
  return <>{children}</>;
}
