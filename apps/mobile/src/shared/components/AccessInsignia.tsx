import { View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Polygon, Stop } from "react-native-svg";
import {
  ACCESS_INSIGNIA_BEVEL,
  ACCESS_INSIGNIA_STAR_BOX,
  ACCESS_INSIGNIA_STAR_POINTS,
  ACCESS_INSIGNIA_STAR_STROKE,
} from "@dubgrid/design-tokens";
import { ORG_ROLE_LABELS, getHighlightedOrgRole, getOrgRoleInsignia } from "@dubgrid/domain";

import { useMobileColors } from "../providers/ThemeModeProvider";

type InsigniaSize = "sm" | "lg";

// Sized to the cap height of the title it follows (22pt beside a screen title,
// 28pt beside a display title), so the mark reads as part of the name rather
// than as a chip the same height as the text.
//
// `pull` trims the row's own 8pt gap so the mark sits a clear 6 to 7pt after
// the name, while the pill that follows keeps the row's normal rhythm.
const SIZES: Record<InsigniaSize, { badge: number; pull: number }> = {
  sm: { badge: 16, pull: -2 },
  lg: { badge: 20, pull: -1 },
};

const EDGE = ACCESS_INSIGNIA_BEVEL.width;
const LIGHT_GRADIENT_ID = "access-insignia-light";
const SHADE_GRADIENT_ID = "access-insignia-shade";

// Web's inset shadows touch only the very top and bottom of the circle, but
// these rings run all the way round, so a shade fading in from the middle read
// as a dark rim along the whole lower half. Light and shade are kept to the
// top and bottom, and the shade is lighter than web's. The light ring sits one
// point inside the edge, as on web: on the outer edge it blended into a light
// page and the circle looked flattened on top.
const BEVEL_LIGHT_END = "0.35";
const BEVEL_SHADE_START = "0.8";
const BEVEL_SHADE_OPACITY = 0.08;

/**
 * The star marking an elevated member, sitting just after their name: gold for
 * a Super Admin, blue for an Admin. Plain users get nothing, so the mark keeps
 * meaning something. Drawn like web's: a 1px ring lit along the top and shaded
 * along the bottom, and the shared star sized to the face inside it.
 */
export function AccessInsignia({
  orgRole,
  size = "sm",
}: {
  orgRole: string | null | undefined;
  /** sm beside a list row's name, lg beside a hero title. */
  size?: InsigniaSize;
}) {
  const mobileColors = useMobileColors();
  const insignia = getOrgRoleInsignia(orgRole);
  const highlightedRole = getHighlightedOrgRole(orgRole);
  if (!insignia || !highlightedRole) {
    return null;
  }

  const { badge, pull } = SIZES[size];
  const radius = badge / 2;
  const starScale = (badge - 2 * EDGE) / ACCESS_INSIGNIA_STAR_BOX;

  return (
    <View
      accessibilityLabel={ORG_ROLE_LABELS[highlightedRole]}
      accessibilityRole="image"
      // A long name shrinks the title beside it, never this.
      style={{ flexShrink: 0, height: badge, marginLeft: pull, width: badge }}
    >
      <Svg width={badge} height={badge}>
        <Defs>
          <LinearGradient id={LIGHT_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ACCESS_INSIGNIA_BEVEL.light} />
            <Stop offset={BEVEL_LIGHT_END} stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={SHADE_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <Stop offset={BEVEL_SHADE_START} stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={BEVEL_SHADE_OPACITY} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={radius}
          cy={radius}
          r={radius}
          fill={insignia === "gold" ? mobileColors.insigniaGold : mobileColors.brand}
        />
        <Circle
          cx={radius}
          cy={radius}
          r={radius - EDGE / 2}
          fill="none"
          stroke={`url(#${SHADE_GRADIENT_ID})`}
          strokeWidth={EDGE}
        />
        <Circle
          cx={radius}
          cy={radius}
          r={radius - 1.5 * EDGE}
          fill="none"
          stroke={`url(#${LIGHT_GRADIENT_ID})`}
          strokeWidth={EDGE}
        />
        <G transform={`translate(${EDGE} ${EDGE}) scale(${starScale})`}>
          <Polygon
            points={ACCESS_INSIGNIA_STAR_POINTS}
            fill={mobileColors.textInverse}
            stroke={mobileColors.textInverse}
            strokeWidth={ACCESS_INSIGNIA_STAR_STROKE}
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    </View>
  );
}
