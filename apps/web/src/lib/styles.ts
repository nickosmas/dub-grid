import type { CSSProperties } from "react";
import { BOX_SHADOW_CARD } from "@/lib/constants";

/** Card-like section container (white bg, border, shadow). */
export const sectionStyle: CSSProperties = {
  background: "var(--dg-color-surface)",
  borderRadius: 12,
  border: "1px solid var(--dg-color-border)",
  overflow: "hidden",
  boxShadow: BOX_SHADOW_CARD,
};

/** Section header bar (bottom-bordered title row). */
export const sectionHeaderStyle: CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid var(--dg-color-border-light)",
  fontWeight: 700,
  fontSize: "var(--dg-fs-body-sm)",
  color: "var(--dg-color-text-secondary)",
};

/** Section body content area. */
export const sectionBodyStyle: CSSProperties = { padding: 20 };

/** Table header cell. */
export const thStyle: CSSProperties = {
  padding: "10px 14px",
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 700,
  color: "var(--dg-color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "left",
  whiteSpace: "nowrap",
};

/** Table data cell. */
export const tdStyle: CSSProperties = {
  padding: "10px 14px",
  fontSize: "var(--dg-fs-label)",
  color: "var(--dg-color-text-primary)",
  borderTop: "1px solid var(--dg-color-border-light)",
};

/** Form field label (uppercase, subtle). */
export const labelStyle: CSSProperties = {
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 700,
  color: "var(--dg-color-text-subtle)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 5,
};

/**
 * Role badge color mapping. Org roles (super_admin/admin/user) share a uniform
 * neutral gray; the variation comes from the label, not the chip color. The
 * platform-level `gridmaster` role keeps a distinct brand tint so it reads as
 * an elevation, not an org role.
 */
const NEUTRAL_ROLE_BADGE = {
  bg: "var(--dg-color-bg-secondary)",
  text: "var(--dg-color-text-muted)",
  border: "var(--dg-color-border-light)",
} as const;

export const ROLE_BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  gridmaster: {
    bg: "#DBEAFE",
    text: "#1D4ED8",
    border: "#93C5FD",
  },
  super_admin: { ...NEUTRAL_ROLE_BADGE },
  admin: { ...NEUTRAL_ROLE_BADGE },
  user: { ...NEUTRAL_ROLE_BADGE },
};
