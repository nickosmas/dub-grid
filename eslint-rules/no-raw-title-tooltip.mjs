/**
 * ESLint rule: enforce tooltip conventions.
 *
 * 1. no-html-title-attribute — Warns on `title=` in JSX except on known safe
 *    elements (Modal, ConfirmDialog, title, svg children).
 * 2. no-raw-tooltip-import — Errors on importing from @/components/ui/tooltip
 *    directly. Consumers should use <Hint> or the tour system.
 */

const SAFE_TITLE_COMPONENTS = new Set([
  "Modal",
  "ConfirmDialog",
  "title",      // SVG <title>
  "Helmet",
]);

/** @type {import("eslint").Rule.RuleModule} */
export const noHtmlTitleAttribute = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow title= attribute on interactive JSX elements. Use <Hint> instead.",
    },
    messages: {
      noTitle:
        'Avoid using the `title` attribute for tooltips — it is inaccessible on touch devices. Use <Hint> from "@/components/ui/hint" instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== "title") return;

        // Get the opening element name
        const openingEl = node.parent;
        const elName =
          openingEl.name?.name ?? openingEl.name?.property?.name ?? "";

        // Only flag intrinsic/lowercase elements. Component `title` props are
        // often structural labels, not browser hover tooltips.
        if (!elName || elName[0] !== elName[0].toLowerCase()) return;

        // Allow known safe components (Modal title prop, SVG <title>, etc.)
        if (SAFE_TITLE_COMPONENTS.has(elName)) return;

        // Allow HTML <title> in <head>
        if (elName === "title") return;

        context.report({ node, messageId: "noTitle" });
      },
    };
  },
};

/** @type {import("eslint").Rule.RuleModule} */
export const noRawTooltipImport = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow direct imports from "@/components/ui/tooltip". Use <Hint> or the tour system.',
    },
    messages: {
      noRawImport:
        'Import from "@/components/ui/hint" instead of "@/components/ui/tooltip". Raw tooltip primitives should only be used inside the Hint wrapper.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (
          source === "@/components/ui/tooltip" &&
          // Allow the Hint wrapper itself to import tooltip primitives
          !filename.endsWith("hint.tsx") &&
          !filename.endsWith("tooltip.tsx")
        ) {
          context.report({ node, messageId: "noRawImport" });
        }
      },
    };
  },
};
