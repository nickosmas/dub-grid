import { describe, expect, it } from "vitest";
import {
  colorTokens,
  createWebCssVariables,
  radiusTokens,
  spacingTokens,
} from "@dubgrid/design-tokens";

import {
  mobileBorderColorFromText,
  mobileColors,
  mobileRadii,
  mobileSpacing,
  mobileText,
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
  it("keeps web runtime variables and mobile tokens sourced from the shared package", () => {
    const webCssVariables = createWebCssVariables();

    expect({
      source: {
        brand: colorTokens.brand,
        surface: colorTokens.surface,
        cardRadius: radiusTokens.card,
        screenX: spacingTokens.screenX,
        screenTitle: mobileTypography.text.screenTitle,
      },
      web: {
        brand: webCssVariables["--dg-color-brand"],
        surface: webCssVariables["--dg-color-surface"],
        controlRadius: webCssVariables["--dg-btn-radius"],
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
            "fontWeight": "700",
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
            "fontWeight": "700",
            "lineHeight": 28,
          },
          "screenX": 16,
          "surface": "#FFFFFF",
        },
        "web": {
          "brand": "#2563EB",
          "controlRadius": "6px",
          "surface": "#FFFFFF",
        },
      }
    `);
  });
});
