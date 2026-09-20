import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { View } from "react-native";
import { ORG_ROLE_LABELS, getHighlightedOrgRole, getOrgRoleInsignia } from "@dubgrid/domain";

import { useMobileColors } from "../providers/ThemeModeProvider";

type InsigniaSize = "sm" | "lg";

// Sized to the cap height of the title it follows (22pt beside a screen title,
// 28pt beside a display title), so the mark reads as part of the name rather
// than as a chip the same height as the text. The star spans about two thirds
// of the circle, matching web: the glyph's outline is ~83% of its font size.
//
// `pull` closes most of the row's own gap. The mark belongs to the name, so it
// should read as attached to it, while the pill that follows keeps the row's
// normal rhythm — which a smaller container gap would have tightened too.
const SIZES: Record<InsigniaSize, { badge: number; glyph: number; pull: number }> = {
  sm: { badge: 16, glyph: 13, pull: -5 },
  lg: { badge: 20, glyph: 16, pull: -5 },
};

/**
 * The star marking an elevated member, sitting just after their name: gold for
 * a Super Admin, blue for an Admin. Plain users get nothing, so the mark keeps
 * meaning something.
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

  const { badge, glyph, pull } = SIZES[size];

  return (
    <View
      accessibilityLabel={ORG_ROLE_LABELS[highlightedRole]}
      accessibilityRole="image"
      style={{
        alignItems: "center",
        backgroundColor: insignia === "gold" ? mobileColors.insigniaGold : mobileColors.brand,
        borderRadius: badge / 2,
        // A long name shrinks the title beside it, never this.
        flexShrink: 0,
        height: badge,
        justifyContent: "center",
        marginLeft: pull,
        width: badge,
      }}
    >
      <MaterialCommunityIcons color={mobileColors.textInverse} name="star" size={glyph} />
    </View>
  );
}
