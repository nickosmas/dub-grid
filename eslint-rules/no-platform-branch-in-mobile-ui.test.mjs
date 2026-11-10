import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import { noPlatformBranchInMobileUi } from "./no-platform-branch-in-mobile-ui.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

tester.run("no-platform-branch-in-mobile-ui", noPlatformBranchInMobileUi, {
  valid: [
    { code: "const mode = KEYBOARD_DISMISS_MODE;", filename: "PeopleScreen.tsx" },
    // Other Platform members carry no layout branch.
    { code: "const scale = Platform.constants;", filename: "PeopleScreen.tsx" },
    { code: 'const os = platform.OS === "ios";', filename: "PeopleScreen.tsx" },
    { code: "const os = Platform[key];", filename: "PeopleScreen.tsx" },
  ],
  invalid: [
    {
      code: 'const gap = Platform.OS === "android" ? 12 : 0;',
      filename: "PeopleScreen.tsx",
      errors: [{ messageId: "platformBranch", data: { member: "OS" } }],
    },
    {
      code: 'const font = Platform.select({ ios: "Menlo", default: "monospace" });',
      filename: "ProfileTwoFactorScreen.tsx",
      errors: [{ messageId: "platformBranch", data: { member: "select" } }],
    },
    {
      code: "const glass = Number(Platform.Version) >= 26;",
      filename: "HomeCard.tsx",
      errors: [{ messageId: "platformBranch", data: { member: "Version" } }],
    },
    ...["ios", "android", "native", "web"].map((suffix) => ({
      code: "export const x = 1;",
      filename: `/repo/apps/mobile/src/features/people/components/Thing.${suffix}.tsx`,
      errors: [{ messageId: "platformFile" }],
    })),
  ],
});
