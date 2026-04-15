import Link from "next/link";
import type { Permissions } from "@/hooks";

interface QuickAction {
  label: string;
  href: string;
  badge?: number;
  variant?: "primary" | "default";
}

function actionIcon(label: string) {
  if (label.includes("schedule")) return "▦";
  if (label.includes("requests")) return "↺";
  if (label.includes("Publish")) return "↑";
  if (label.includes("users")) return "◉";
  return "•";
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
    <div
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        padding: "8px 0 4px",
      }}
    >
      {actions.map((action) => (
        <Link
          key={action.label}
          href={action.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 14px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
            border: action.variant === "primary"
              ? "1px solid var(--color-brand)"
              : "1px solid var(--color-border)",
            background: action.variant === "primary"
              ? "var(--color-brand)"
              : "var(--color-surface)",
            color: action.variant === "primary"
              ? "#fff"
              : "var(--color-text-primary)",
            transition: "opacity 0.15s",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: 999,
              fontSize: 10,
              background: action.variant === "primary"
                ? "rgba(255,255,255,0.2)"
                : "var(--color-bg-secondary)",
              color: action.variant === "primary"
                ? "#fff"
                : "var(--color-brand)",
              flexShrink: 0,
            }}
          >
            {actionIcon(action.label)}
          </span>
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
