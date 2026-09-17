/**
 * ESLint rule: mobile styles take their numbers from the design tokens.
 *
 * The mobile app declares a 4pt spacing ramp (4, 8, 12, 16, 20, 24, 32, 40,
 * 48) and a typography ramp, and then wrote 690 raw spacing literals and 46
 * raw font sizes next to them. A third of the spacing values were off the ramp
 * (10 alone appeared as often as 8), so screens were each internally
 * consistent and never lined up with one another. The 2026-09-17 mobile audit
 * chose to ban the 2/6/10/14 sub-grid rather than adopt it.
 *
 * Flags, inside any object literal:
 *  - a numeric `fontSize`: every size lives in `mobileTypographyTokens.text`,
 *    reached through `mobileText.<variant>` or `<AppText variant>`;
 *  - a numeric `padding*`, `margin*`, `gap`, `rowGap` or `columnGap` whose
 *    absolute value is not 0, not 1, and not on the ramp. On-ramp literals
 *    pass: the rule is about the grid, and `mobileSpace.md` versus `12` is a
 *    readability choice the migration (38d) makes file by file. A 1pt value
 *    is an optical nudge (an icon dropped a point to sit on the text's
 *    baseline, a dot centred on a hairline), not a spacing decision, and it
 *    passes for the same reason 0 does.
 *
 * Deliberately not flagged: `width`, `height`, `top`, `left`, radii, border
 * widths and icon sizes. Those have their own tokens where it matters
 * (`mobileControl`, `mobileRadii`) and their own reasons to be exact.
 *
 * Wired as an error since the 38d migration cleared the last literal.
 */

const SPACING_RAMP = new Set([0, 1, 4, 8, 12, 16, 20, 24, 32, 40, 48]);
const SPACING_KEY = /^(padding|margin)[A-Za-z]*$|^(gap|rowGap|columnGap)$/;

function numericValue(node) {
  if (node.type === "Literal" && typeof node.value === "number") return node.value;
  if (
    node.type === "UnaryExpression" &&
    node.operator === "-" &&
    node.argument.type === "Literal" &&
    typeof node.argument.value === "number"
  ) {
    return -node.argument.value;
  }
  return null;
}

function keyName(property) {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal" && typeof property.key.value === "string") {
    return property.key.value;
  }
  return null;
}

export const noRawMobileMetrics = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Mobile styles take font sizes from the typography tokens and spacing from the 4pt ramp.",
    },
    messages: {
      rawFontSize:
        "Raw fontSize {{value}}. Spread a `mobileText` variant (or render `<AppText variant>`) so the size and line height come from the ramp together.",
      offRampSpacing:
        "{{key}}: {{value}} is off the spacing ramp (4, 8, 12, 16, 20, 24, 32, 40, 48). Round to a `mobileSpace` step; the 2/6/10/14 sub-grid is not part of the system.",
    },
    schema: [],
  },

  create(context) {
    return {
      Property(node) {
        const key = keyName(node);
        if (!key) return;

        if (key === "fontSize") {
          const value = numericValue(node.value);
          if (value === null) return;
          context.report({ node: node.value, messageId: "rawFontSize", data: { value } });
          return;
        }

        if (!SPACING_KEY.test(key)) return;
        const value = numericValue(node.value);
        if (value === null || SPACING_RAMP.has(Math.abs(value))) return;
        context.report({ node: node.value, messageId: "offRampSpacing", data: { key, value } });
      },
    };
  },
};
