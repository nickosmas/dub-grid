"use client";

import { ORG_ROLE_LABELS, getHighlightedOrgRole, getOrgRoleInsignia } from "@dubgrid/domain";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import type { OrganizationRole } from "@/types";

type InsigniaSize = "sm" | "md" | "lg";

// Sized to the cap height of the name it follows, so the mark reads as part of
// the name rather than as a chip beside it.
//
// `pull` closes most of the row's own gap. The mark belongs to the name, so it
// should read as attached to it, while the chips that follow ("You", "On
// Schedule") keep the row's normal rhythm — which a smaller container gap would
// have tightened along with it.
const SIZES: Record<InsigniaSize, { badge: number; pull: number }> = {
  sm: { badge: 14, pull: -4 },
  md: { badge: 16, pull: -5 },
  lg: { badge: 20, pull: -7 },
};

// A regular five-point star drawn about the viewBox center, spanning about two
// thirds of it. A regular star's centroid is its circumcircle's center, so this
// lands the star's visual weight on the circle's center; lucide's Star is drawn
// off-center in its viewBox and sat visibly low and to the right. The svg is
// the full chip rather than a smaller glyph centered in it, so it never lands
// on a half pixel. The round stroke softens the points the way lucide's does.
const STAR_OUTER_RADIUS = 7.6;
const STAR_INNER_RADIUS = 3.4;
const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? STAR_OUTER_RADIUS : STAR_INNER_RADIUS;
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${(12 + radius * Math.cos(angle)).toFixed(2)},${(12 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

interface AccessInsigniaProps {
  orgRole: OrganizationRole | string | null | undefined;
  /** Sized against the name it follows: sm for a row, md for a panel, lg for a page title. */
  size?: InsigniaSize;
}

/**
 * The star marking an elevated member, sitting just after their name: gold for
 * a Super Admin, blue for an Admin. Plain users get nothing, so the mark keeps
 * meaning something.
 */
export function AccessInsignia({ orgRole, size = "sm" }: AccessInsigniaProps) {
  const insignia = getOrgRoleInsignia(orgRole);
  const highlightedRole = getHighlightedOrgRole(orgRole);
  if (!insignia || !highlightedRole) {
    return null;
  }

  const { badge, pull } = SIZES[size];
  const label = ORG_ROLE_LABELS[highlightedRole];

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
          background:
            insignia === "gold" ? "var(--dg-color-insignia-gold)" : "var(--dg-color-brand)",
          color: "var(--dg-color-text-inverse)",
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          width={badge}
          height={badge}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        >
          <polygon points={STAR_POINTS} />
        </svg>
      </span>
    </Hint>
  );
}
