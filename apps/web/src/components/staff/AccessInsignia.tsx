"use client";

import { Crown, Star } from "lucide-react";
import { ORG_ROLE_LABELS, getHighlightedOrgRole, getOrgRoleInsignia } from "@dubgrid/domain";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import type { OrganizationRole } from "@/types";

type InsigniaSize = "sm" | "md" | "lg";

// Sized to stay legible at a glance rather than to stay discreet, with the glyph
// at ~55% of the circle so the crown has room to read as a crown.
//
// `pull` closes most of the row's own gap. The mark belongs to the name, so it
// should read as attached to it, while the chips that follow ("You", "On
// Schedule") keep the row's normal rhythm — which a smaller container gap would
// have tightened along with it.
const SIZES: Record<InsigniaSize, { badge: number; glyph: number; pull: number }> = {
  sm: { badge: 16, glyph: 9, pull: -4 },
  md: { badge: 20, glyph: 11, pull: -5 },
  lg: { badge: 26, glyph: 15, pull: -7 },
};

interface AccessInsigniaProps {
  orgRole: OrganizationRole | string | null | undefined;
  /** Sized against the name it follows: sm for a row, md for a panel, lg for a page title. */
  size?: InsigniaSize;
}

/**
 * The crown or star marking an elevated member, sitting just after their name.
 * Plain users get nothing, so the mark keeps meaning something.
 */
export function AccessInsignia({ orgRole, size = "sm" }: AccessInsigniaProps) {
  const insignia = getOrgRoleInsignia(orgRole);
  const highlightedRole = getHighlightedOrgRole(orgRole);
  if (!insignia || !highlightedRole) {
    return null;
  }

  const { badge, glyph, pull } = SIZES[size];
  const Glyph = insignia === "crown" ? Crown : Star;
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
            insignia === "crown" ? "var(--dg-color-insignia-crown)" : "var(--dg-color-brand)",
          color: "var(--dg-color-text-inverse)",
        }}
      >
        <Glyph aria-hidden size={glyph} strokeWidth={2} fill="currentColor" />
      </span>
    </Hint>
  );
}
