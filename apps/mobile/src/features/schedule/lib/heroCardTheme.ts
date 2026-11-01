/** The look of the schedule hero card on Home, kept out of the screen file. */
import { mobileOnAccent } from "../../../shared/theme/tokens";
export const HERO_CARD_BACKGROUND_LIGHT = "#2946C7";
export const HERO_CARD_BACKGROUND_DARK = "#152238";
export const HERO_COLLABORATOR_BACKGROUND_LIGHT = "#3A55CB";
export const HERO_COLLABORATOR_BACKGROUND_DARK = "#1E2F66";
// Matches the web hero gradient: dark bottom-left to light top-right. The
// dark-mode variant keeps the same dark navy start but ends in the app's
// own vivid dark-mode brand blue instead of a pale periwinkle, which would
// read as a washed-out pastel blob against a near-black page.
export const HERO_CARD_GRADIENT_LIGHT = ["#142579", "#2C49CC", "#6E90FF"] as const;
export const HERO_CARD_GRADIENT_DARK = ["#0A1442", "#1D3AA0", "#2075FF"] as const;
export const HERO_CARD_GRADIENT_LOCATIONS = [0, 0.55, 1] as const;
export const HERO_CARD_GRADIENT_START = { x: 0, y: 1 } as const;
export const HERO_CARD_GRADIENT_END = { x: 1, y: 0 } as const;
// The flat fill the hero takes on device, where a native card has no
// gradient: the gradient's own middle, so the card keeps its blue in dark mode
// rather than settling on the gradient's near-black navy ground.
export const HERO_CARD_FLAT_LIGHT = HERO_CARD_GRADIENT_LIGHT[1];
export const HERO_CARD_FLAT_DARK = HERO_CARD_GRADIENT_DARK[1];
// A chip that sits on the hero gradient lightens the gradient rather than
// bringing a surface of its own; `SplitShiftBadge` and `ShiftChangeBadge`
// share these so the two chips in the hero's title row match.
export const HERO_INVERSE_CHIP_FILL = mobileOnAccent.fill;
export const HERO_INVERSE_CHIP_BORDER = mobileOnAccent.hairline;
