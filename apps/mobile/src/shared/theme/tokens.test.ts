import { describe, expect, it } from "vitest";
import { colorTokens, radiusTokens, spacingTokens } from "@dubgrid/design-tokens";
import {
  darkMobileColors,
  mobileBorderColorFromText,
  mobileColors,
  mobileSoftGradientStops,
  mobileRadii,
  mobileSpacing,
  mobileText,
  mobileTextWeighted,
  mobileTypography,
  mobileDarkenTone,
  mobileVisiblePillBorder,
} from "./tokens";

describe("mobileBorderColorFromText", () => {
  it("derives a visible rgba border from a hex text color", () => {
    expect(mobileBorderColorFromText("#1E293B")).toBe("rgba(30,41,59,0.35)");
  });

  it("falls back to the default mobile border color for invalid input", () => {
    expect(mobileBorderColorFromText("transparent")).toBe("#CBD5E1");
  });
});

describe("mobileVisiblePillBorder", () => {
  it("derives the border from the text color when none is stored", () => {
    expect(mobileVisiblePillBorder("transparent", "#92400E")).toBe("rgba(146,64,14,0.35)");
    expect(mobileVisiblePillBorder(null, "#92400E")).toBe("rgba(146,64,14,0.35)");
    expect(mobileVisiblePillBorder("  ", "#92400E")).toBe("rgba(146,64,14,0.35)");
  });

  it("keeps an explicitly stored border color", () => {
    expect(mobileVisiblePillBorder("#D97706", "#92400E")).toBe("#D97706");
  });
});

describe("mobileDarkenTone", () => {
  const lightTone = {
    backgroundColor: "#FDE68A",
    borderColor: "transparent",
    textColor: "#92400E",
  };

  it("leaves page-tuned colors alone in light mode", () => {
    expect(mobileDarkenTone(lightTone, false)).toEqual(lightTone);
  });

  it("remaps the fill and re-derives text and border in dark mode", () => {
    const darkened = mobileDarkenTone(lightTone, true);

    expect(darkened.backgroundColor).not.toBe(lightTone.backgroundColor);
    expect(darkened.borderColor).not.toBe("transparent");
    expect(darkened).toMatchInlineSnapshot(`
      {
        "backgroundColor": "#725F15",
        "borderColor": "rgba(241,228,177,0.35)",
        "textColor": "#F1E4B1",
      }
    `);
  });
});

describe("shared design token derivation", () => {
  it("keeps mobile tokens sourced from the shared package", () => {
    expect({
      source: {
        brand: colorTokens.brand,
        surface: colorTokens.surface,
        cardRadius: radiusTokens.card,
        screenX: spacingTokens.screenX,
        screenTitle: mobileTypography.text.screenTitle,
      },
      mobile: {
        brand: mobileColors.brand,
        surface: mobileColors.surface,
        cardRadius: mobileRadii.card,
        screenX: mobileSpacing.screenX,
        screenTitle: mobileText.screenTitle,
      },
    }).toMatchInlineSnapshot(`
      {
        "mobile": {
          "brand": "#2563EB",
          "cardRadius": 16,
          "screenTitle": {
            "fontFamily": "DMSans_700Bold",
            "fontSize": 22,
            "lineHeight": 28,
          },
          "screenX": 16,
          "surface": "#FFFFFF",
        },
        "source": {
          "brand": "#2563EB",
          "cardRadius": 16,
          "screenTitle": {
            "fontFamily": "DMSans_700Bold",
            "fontSize": 22,
            "lineHeight": 28,
          },
          "screenX": 16,
          "surface": "#FFFFFF",
        },
      }
    `);
  });
});

describe("DM Sans weights", () => {
  // Regression guard for an Android-only, silent font fallback. expo-font
  // registers each DM Sans file under its own family name at style NORMAL, so a
  // style naming both the family and a numeric weight of 500+ sends Android
  // hunting for a bold face that family doesn't have — and it lands on the
  // system font. Every heading in the app rendered in Roboto on Android once.
  // iOS resolves the family regardless, so nothing here is visible in an iOS
  // build or in this jsdom suite; the assertions are the only thing standing
  // between a re-added `fontWeight` and shipping Roboto again.
  it("carries no fontWeight on any text token", () => {
    for (const [variant, style] of Object.entries(mobileText)) {
      expect(style, `mobileText.${variant} must name its weight via fontFamily alone`).not.toEqual(
        expect.objectContaining({ fontWeight: expect.anything() }),
      );
      expect(style.fontFamily, `mobileText.${variant} must name a DM Sans family`).toMatch(
        /^DMSans_/,
      );
    }
  });

  it("moves the family, not the weight, when re-weighting a token", () => {
    const medium = mobileTextWeighted("body", "medium");

    expect(medium.fontFamily).toBe("DMSans_500Medium");
    expect(medium.fontWeight).toBeUndefined();
    // Everything else about the token survives the swap.
    expect(medium.fontSize).toBe(mobileText.body.fontSize);
    expect(medium.lineHeight).toBe(mobileText.body.lineHeight);
  });

  it("maps every family alias to a real DM Sans file", () => {
    expect(mobileTypography.fontFamily).toEqual({
      base: "DMSans_400Regular",
      regular: "DMSans_400Regular",
      medium: "DMSans_500Medium",
      semibold: "DMSans_600SemiBold",
      bold: "DMSans_700Bold",
    });
  });
});

describe("card border", () => {
  it("is invisible in light mode and a hairline in dark", () => {
    // Transparent rather than absent, so the 1px keeps occupying layout and
    // nothing reflows when the theme flips.
    expect(mobileColors.cardBorder).toBe("transparent");
    expect(darkMobileColors.cardBorder).not.toBe("transparent");
  });
});

describe("mobile soft gradient", () => {
  it("dissolves the light brand wash into the mobile page, not the web one", () => {
    const stops = mobileSoftGradientStops("brandWash", false);

    // The shared token ends on the web page colour; ending there on mobile
    // leaves a visible band partway down the screen.
    expect(stops.at(-1)).toBe(mobileColors.background);
  });

  it("leaves the other kinds to the shared tokens", () => {
    // `aurora` fades to fully transparent, so it needs no page-colour fixup.
    expect(mobileSoftGradientStops("aurora", false).at(-1)).toContain("0.00");
    expect(mobileSoftGradientStops("brandWash", true).at(-1)).toBe(darkMobileColors.background);
  });
});
