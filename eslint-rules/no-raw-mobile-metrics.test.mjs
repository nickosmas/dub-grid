import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import { noRawMobileMetrics } from "./no-raw-mobile-metrics.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

tester.run("no-raw-mobile-metrics", noRawMobileMetrics, {
  valid: [
    "const s = { padding: 16, gap: 8, marginTop: -4, paddingHorizontal: 0 };",
    "const s = { padding: mobileSpace.lg, ...mobileText.body };",
    "const s = { width: 46, height: 10, borderRadius: 6, top: 14 };",
    'const s = { ["padding"]: 10 };',
  ],
  invalid: [
    {
      code: "const s = { fontSize: 17 };",
      errors: [{ messageId: "rawFontSize", data: { value: 17 } }],
    },
    {
      code: "const s = { gap: 10, paddingVertical: 6, marginLeft: -14 };",
      errors: [
        { messageId: "offRampSpacing", data: { key: "gap", value: 10 } },
        { messageId: "offRampSpacing", data: { key: "paddingVertical", value: 6 } },
        { messageId: "offRampSpacing", data: { key: "marginLeft", value: -14 } },
      ],
    },
    {
      code: 'const s = { "columnGap": 2 };',
      errors: [{ messageId: "offRampSpacing" }],
    },
  ],
});
