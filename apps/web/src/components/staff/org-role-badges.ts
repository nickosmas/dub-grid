import type { CSSProperties } from "react";
import type { DirectoryPerson } from "@/types";

// The labels and the which-roles-get-badged rule are shared with mobile so the
// two can't drift; only the styling below is web-specific.
export { ORG_ROLE_LABELS, getHighlightedOrgRole } from "@dubgrid/domain";

export function getOrgRoleBadgeStyle(
  _role: DirectoryPerson["orgRole"] | null | undefined,
): CSSProperties {
  return {
    background: "var(--color-bg-secondary)",
    border: "1px solid var(--color-border-light)",
    color: "var(--color-text-muted)",
  };
}
