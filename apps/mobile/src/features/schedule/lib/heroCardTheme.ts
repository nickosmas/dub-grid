/** The look of the schedule hero card on Home, kept out of the screen file. */
import { heroMeshTokens } from "@dubgrid/design-tokens";
import { mobileOnAccent } from "../../../shared/theme/tokens";
// The mesh's own base, under the drawn backdrop until it paints.
export const HERO_CARD_BACKGROUND_LIGHT = heroMeshTokens.light.base;
export const HERO_CARD_BACKGROUND_DARK = heroMeshTokens.dark.base;
export const HERO_COLLABORATOR_BACKGROUND_LIGHT = "#3A55CB";
export const HERO_COLLABORATOR_BACKGROUND_DARK = "#1E2F66";
export const HERO_CARD_SHADOW_LIGHT = "rgba(37, 99, 235, 0.3)";
export const HERO_CARD_SHADOW_DARK = "rgba(32, 117, 255, 0.28)";
// A chip that sits on the hero gradient lightens the gradient rather than
// bringing a surface of its own; `SplitShiftBadge` and `ShiftChangeBadge`
// share these so the two chips in the hero's title row match.
export const HERO_INVERSE_CHIP_FILL = mobileOnAccent.fill;
export const HERO_INVERSE_CHIP_BORDER = mobileOnAccent.hairline;
