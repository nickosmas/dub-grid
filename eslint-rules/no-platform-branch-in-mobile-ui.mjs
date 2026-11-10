/**
 * Mobile screens and feature components are written once for both phones
 * (item 56d): a platform difference belongs in a shared primitive under
 * `src/shared`, never in a screen. This refuses `Platform.OS`,
 * `Platform.select` and `Platform.Version`, and a platform-suffixed file
 * (`.ios`, `.android`, `.native`, `.web`), in the files it is applied to.
 */
const PLATFORM_MEMBERS = new Set(["OS", "select", "Version"]);
const PLATFORM_SUFFIX = /\.(ios|android|native|web)\.[cm]?[jt]sx?$/;

export const noPlatformBranchInMobileUi = {
  meta: {
    type: "problem",
    docs: {
      description: "Keep platform branches out of mobile screens and feature components",
    },
    schema: [],
    messages: {
      platformBranch:
        "Platform.{{member}} in a screen or feature component. Move the difference into a shared primitive under src/shared (see apps/mobile/AGENTS.md).",
      platformFile:
        "A platform-suffixed file in a screen or feature component. Draw one control for both phones, or put the native piece in src/shared.",
    },
  },
  create(context) {
    const filename = context.physicalFilename ?? context.filename;
    return {
      Program(node) {
        if (PLATFORM_SUFFIX.test(filename)) {
          context.report({ node, messageId: "platformFile" });
        }
      },
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          node.object.name === "Platform" &&
          !node.computed &&
          node.property.type === "Identifier" &&
          PLATFORM_MEMBERS.has(node.property.name)
        ) {
          context.report({
            node,
            messageId: "platformBranch",
            data: { member: node.property.name },
          });
        }
      },
    };
  },
};
