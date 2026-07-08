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
} from "./tokens";

describe("mobileBorderColorFromText", () => {
  it("derives a visible rgba border from a hex text color", () => {
    expect(mobileBorderColorFromText("#1E293B")).toBe("rgba(30,41,59,0.35)");
  });

  it("falls back to the default mobile border color for invalid input", () => {
    expect(mobileBorderColorFromText("transparent")).toBe("#CBD5E1");
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
