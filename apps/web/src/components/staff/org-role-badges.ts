import type { CSSProperties } from "react";
import type { DirectoryPerson } from "@/types";

type OrgRole = NonNullable<DirectoryPerson["orgRole"]>;

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "Member",
};

export function getHighlightedOrgRole(
  role: DirectoryPerson["orgRole"] | null | undefined,
): Extract<OrgRole, "super_admin" | "admin"> | null {
  return role === "super_admin" || role === "admin" ? role : null;
}

export function getOrgRoleBadgeStyle(
  role: DirectoryPerson["orgRole"] | null | undefined,
): CSSProperties {
  if (role === "super_admin") {
    return {
      background: "var(--color-warning-bg)",
      border: "1px solid var(--color-warning-border)",
      color: "var(--color-warning-text)",
    };
  }

  if (role === "admin") {
    return {
      background: "var(--color-brand-bg)",
      border: "1px solid var(--color-brand-border)",
      color: "var(--color-brand)",
    };
  }

  return {
    background: "var(--color-border-light)",
    border: "1px solid var(--color-border-light)",
    color: "var(--color-text-muted)",
  };
}

