import type { CSSProperties } from "react";
import { BOX_SHADOW_CARD } from "@/lib/constants";

/** Card-like section container (white bg, border, shadow). */
export const sectionStyle: CSSProperties = {
  background: "var(--color-surface)",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  overflow: "hidden",
  boxShadow: BOX_SHADOW_CARD,
};

/** Section header bar (bottom-bordered title row). */
export const sectionHeaderStyle: CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid var(--color-border-light)",
  fontWeight: 700,
  fontSize: "var(--dg-fs-body-sm)",
  color: "var(--color-text-secondary)",
};

/** Section body content area. */
export const sectionBodyStyle: CSSProperties = { padding: 20 };

/** Table header cell. */
export const thStyle: CSSProperties = {
  padding: "10px 14px",
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "left",
  whiteSpace: "nowrap",
};

/** Table data cell. */
export const tdStyle: CSSProperties = {
  padding: "10px 14px",
  fontSize: "var(--dg-fs-label)",
  color: "var(--color-text-primary)",
  borderTop: "1px solid var(--color-border-light)",
};

/** Form field label (uppercase, subtle). */
export const labelStyle: CSSProperties = {
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 5,
};

/** Role badge color mapping. */
export const ROLE_BADGE_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  gridmaster: {
    bg: "#EFF6FF",
    text: "#1D4ED8",
    border: "#BFDBFE",
  },
  super_admin: {
    bg: "#FEF3C7",
    text: "#92400E",
    border: "#FDE68A",
  },
  admin: {
    bg: "#F0F7F0",
    text: "#004501",
    border: "#BFDFBF",
  },
  user: {
    bg: "var(--color-bg-secondary)",
    text: "var(--color-text-muted)",
    border: "var(--color-border-light)",
  },
};
