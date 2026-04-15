import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import {
  noHtmlTitleAttribute,
  noRawTooltipImport,
} from "./eslint-rules/no-raw-title-tooltip.mjs";

const tooltipPlugin = {
  rules: {
    "no-html-title-attribute": noHtmlTitleAttribute,
    "no-raw-tooltip-import": noRawTooltipImport,
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    plugins: { tooltip: tooltipPlugin },
    rules: {
      "tooltip/no-html-title-attribute": "warn",
      "tooltip/no-raw-tooltip-import": "error",
    },
  },
]);

export default eslintConfig;
