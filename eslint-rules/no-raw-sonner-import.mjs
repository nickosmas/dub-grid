/**
 * ESLint rule: no-raw-sonner-import.
 *
 * Disallow importing from "sonner" directly. Components must use the `notify`
 * wrapper from "@/lib/notify", which keeps toast copy structured, durations
 * consistent, and error toasts funnelled through `formatClientErrorMessage`.
 *
 * Two files are allowed to import `sonner` directly:
 *  - `lib/notify.ts`  — the wrapper itself.
 *  - `app/layout.tsx` — mounts the <Toaster /> host component.
 */

/** @type {import("eslint").Rule.RuleModule} */
export const noRawSonnerImport = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow direct imports from "sonner". Use `notify` from "@/lib/notify".',
    },
    messages: {
      noRawImport:
        'Import `notify` from "@/lib/notify" instead of importing "sonner" directly. The wrapper keeps toast copy, durations, and error translation consistent.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();

    const isAllowedFile =
      filename.endsWith("/lib/notify.ts") ||
      filename.endsWith("/app/layout.tsx");

    if (isAllowedFile) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value === "sonner") {
          context.report({ node, messageId: "noRawImport" });
        }
      },
    };
  },
};
