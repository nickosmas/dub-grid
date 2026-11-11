"use client";

import {
  ACCESS_INSIGNIA_BEVEL,
  ACCESS_INSIGNIA_STAR_BOX,
  ACCESS_INSIGNIA_STAR_POINTS,
  ACCESS_INSIGNIA_STAR_STROKE,
} from "@dubgrid/design-tokens";
import { ORG_ROLE_LABELS, getHighlightedOrgRole, getOrgRoleInsignia } from "@dubgrid/domain";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import type { OrganizationRole } from "@/types";

type InsigniaSize = "sm" | "md" | "lg";

// Sized to the cap height of the name it follows, so the mark reads as part of
// the name rather than as a chip beside it.
//
// `pull` trims the row's own gap so the mark sits a clear 6 to 8px after the
// name in every row and header (rows use 6-8px gaps, panels 8px, page titles
// 10-12px), while the chips that follow ("You", "On Schedule") keep the row's
// normal rhythm.
const SIZES: Record<InsigniaSize, { badge: number; pull: number }> = {
  sm: { badge: 14, pull: 0 },
  md: { badge: 16, pull: -2 },
  lg: { badge: 20, pull: -2 },
};

const EDGE = ACCESS_INSIGNIA_BEVEL.width;

// The highlight sits one pixel inside the top edge: a white line on the outer
// pixel blends into a light page, so the circle looked flattened on top. The
// first shadow, in the badge's own color, covers the outer pixel and keeps the
// outline round; the shade stays on the bottom edge.
function bevelShadow(fill: string): string {
  return [
    `inset 0 ${EDGE}px 0 ${fill}`,
    `inset 0 ${2 * EDGE}px 0 ${ACCESS_INSIGNIA_BEVEL.light}`,
    `inset 0 -${EDGE}px 0 ${ACCESS_INSIGNIA_BEVEL.shade}`,
  ].join(", ");
}
const STAR_VIEW_BOX = `0 0 ${ACCESS_INSIGNIA_STAR_BOX} ${ACCESS_INSIGNIA_STAR_BOX}`;

interface AccessInsigniaProps {
  orgRole: OrganizationRole | string | null | undefined;
  /** Sized against the name it follows: sm for a row, md for a panel, lg for a page title. */
  size?: InsigniaSize;
}

/**
 * The star marking an elevated member, sitting just after their name: gold for
 * a Super Admin, blue for an Admin. Plain users get nothing, so the mark keeps
 * meaning something. A 1px bevel lights the top edge and shades the bottom; the
 * star fills the face inside it, so a 14px badge is a true copy of a 20px one.
 */
export function AccessInsignia({ orgRole, size = "sm" }: AccessInsigniaProps) {
  const insignia = getOrgRoleInsignia(orgRole);
  const highlightedRole = getHighlightedOrgRole(orgRole);
  if (!insignia || !highlightedRole) {
    return null;
  }

  const { badge, pull } = SIZES[size];
  const label = ORG_ROLE_LABELS[highlightedRole];
  const fill = insignia === "gold" ? "var(--dg-color-insignia-gold)" : "var(--dg-color-brand)";

  return (
    <Hint content={hint(label)}>
      <span
        role="img"
        aria-label={label}
        className="inline-flex shrink-0 items-center justify-center rounded-full"
        style={{
          marginLeft: pull,
          width: badge,
          height: badge,
          background: fill,
          color: "var(--dg-color-text-inverse)",
          boxShadow: bevelShadow(fill),
        }}
      >
        <svg
          aria-hidden
          viewBox={STAR_VIEW_BOX}
          width={badge - 2 * EDGE}
          height={badge - 2 * EDGE}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={ACCESS_INSIGNIA_STAR_STROKE}
          strokeLinejoin="round"
        >
          <polygon points={ACCESS_INSIGNIA_STAR_POINTS} />
        </svg>
      </span>
    </Hint>
  );
}
