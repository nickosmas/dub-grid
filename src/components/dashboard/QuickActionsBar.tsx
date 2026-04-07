import Link from "next/link";
import type { Permissions } from "@/hooks";

interface QuickAction {
  label: string;
  href: string;
  badge?: number;
  variant?: "primary" | "default";
}

interface QuickActionsBarProps {
  permissions: Permissions;
  pendingApprovalCount: number;
  draftCount: number;
}

export default function QuickActionsBar({
  permissions,
  pendingApprovalCount,
  draftCount,
}: QuickActionsBarProps) {
  const actions: QuickAction[] = [];

  const hasAdminCapability = permissions.level >= 2 || permissions.canManageOrg || permissions.canEditShifts || permissions.canManageEmployees || permissions.canViewDashboardAnalytics;

  if (permissions.level >= 3) {
    // Super admin
    actions.push({ label: "Manage users", href: "/settings", variant: "primary" });
    actions.push({ label: "Go to schedule", href: "/schedule" });
    if (pendingApprovalCount > 0) {
      actions.push({
        label: "Review requests",
        href: "/schedule?panel=requests",
        badge: pendingApprovalCount,
      });
    }
  } else if (hasAdminCapability) {
    // Admin or department-permissioned user with management capabilities
    actions.push({ label: "Go to schedule", href: "/schedule", variant: "primary" });
    if (permissions.canApproveShiftRequests && pendingApprovalCount > 0) {
      actions.push({
        label: "Review requests",
        href: "/schedule?panel=requests",
        badge: pendingApprovalCount,
      });
    }
    if (permissions.canPublishSchedule && draftCount > 0) {
      actions.push({ label: "Publish changes", href: "/schedule", badge: draftCount });
    }
  } else {
    // Read-only user
    actions.push({ label: "View my schedule", href: "/schedule", variant: "primary" });
    actions.push({ label: "Browse open shifts", href: "/schedule?panel=requests" });
  }

  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
      {actions.map((action) => (
        <Link
          key={action.label}
          href={action.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
            border: action.variant === "primary"
              ? "1px solid var(--color-primary)"
              : "1px solid var(--color-border)",
            background: action.variant === "primary"
              ? "var(--color-primary)"
              : "var(--color-surface)",
            color: action.variant === "primary"
              ? "#fff"
              : "var(--color-text-primary)",
            transition: "opacity 0.15s",
          }}
        >
          {action.label}
          {action.badge != null && action.badge > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                fontSize: 10,
                fontWeight: 700,
                background: action.variant === "primary"
                  ? "rgba(255,255,255,0.25)"
                  : "var(--color-danger)",
                color: action.variant === "primary"
                  ? "#fff"
                  : "#fff",
                padding: "0 5px",
              }}
            >
              {action.badge}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
