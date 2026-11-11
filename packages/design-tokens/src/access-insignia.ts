/**
 * The access star beside an Admin's or Super Admin's name, shared by web and
 * mobile so both draw the same badge. The star is drawn in a 24-unit box that
 * maps onto the face inside the bevel, not the whole circle: the bevel is a
 * fixed pixel width, so sizing the star to the circle would crowd it at 14px.
 */
export const ACCESS_INSIGNIA_STAR_BOX = 24;

/** Round-joined stroke, in box units, that softens the star's points. */
export const ACCESS_INSIGNIA_STAR_STROKE = 2;

const STAR_OUTER_RADIUS = 7.6;
const STAR_INNER_RADIUS = 3.4;
const CENTER = ACCESS_INSIGNIA_STAR_BOX / 2;

// A regular star is centered on its circumcircle, so drawing about the box
// center lands its visual weight there; icon-font stars sit low and right.
export const ACCESS_INSIGNIA_STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? STAR_OUTER_RADIUS : STAR_INNER_RADIUS;
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${(CENTER + radius * Math.cos(angle)).toFixed(2)},${(CENTER + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

/**
 * The soft bevel on the circle's edge: a line lit along the top and one shaded
 * along the bottom, the same pixel width at every size. Face and star stay flat.
 */
export const ACCESS_INSIGNIA_BEVEL = {
  width: 1,
  light: "rgba(255, 255, 255, 0.3)",
  shade: "rgba(0, 0, 0, 0.16)",
} as const;
