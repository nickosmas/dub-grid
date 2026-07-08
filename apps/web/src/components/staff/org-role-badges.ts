import type { CSSProperties } from "react";
import type { DirectoryPerson } from "@/types";

type OrgRole = NonNullable<DirectoryPerson["orgRole"]>;

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

export function getHighlightedOrgRole(
  role: DirectoryPerson["orgRole"] | null | undefined,
): Extract<OrgRole, "super_admin" | "admin"> | null {
  return role === "super_admin" || role === "admin" ? role : null;
}

export function getOrgRoleBadgeStyle(
  _role: DirectoryPerson["orgRole"] | null | undefined,
): CSSProperties {
  return {
    background: "var(--color-bg-secondary)",
    border: "1px solid var(--color-border-light)",
    color: "var(--color-text-muted)",
  };
}
