/**
 * ESLint rule: keep user-facing copy in the house style the 2026-10-28 copy
 * review settled (blueprint/history/fixes/app-copy-review.md).
 *
 * It reports, wherever a string reaches the reader, the characters and phrases
 * the review removed: em and en dashes, the ellipsis character, "Please",
 * "Failed to" anywhere in the string, and a hardcoded "focus area", which an
 * organization renames ("Wings", "Units") and must come from its labels.
 */

/** JSX props whose string value is rendered or announced to the reader. */
const USER_VISIBLE_PROPS = new Set([
  "accessibilityHint",
  "accessibilityLabel",
  "actionLabel",
  "aria-label",
  "ariaLabel",
  "body",
  "cancelLabel",
  "confirmLabel",
  "confirmPendingLabel",
  "description",
  "detail",
  "emptyLabel",
  "heading",
  "helpText",
  "hint",
  "label",
  "loadingLabel",
  "message",
  "placeholder",
  "subtitle",
  "title",
]);

/** Object keys whose string value reaches the reader. */
const USER_VISIBLE_KEYS = new Set([
  "body",
  "description",
  "detail",
  "error",
  "label",
  "loadingLabel",
  "message",
  "placeholder",
  "subtitle",
  "title",
]);

const TOAST_METHODS = new Set(["error", "success", "info", "warning", "message", "loading"]);

const PATTERNS = [
  {
    id: "emDash",
    re: /—/,
    hint: "Rephrase with a comma, a colon or a full stop.",
  },
  {
    id: "enDash",
    re: /–/,
    hint: 'Write a range with a spaced hyphen: "7:00 AM - 3:00 PM".',
  },
  {
    id: "ellipsis",
    re: /…/,
    hint: 'Drop it: "Loading", "Search staff".',
  },
  {
    id: "please",
    re: /\bPlease\s/,
    hint: 'Say what to do instead: "Try again.", "Enter your email."',
  },
  {
    id: "failedTo",
    re: /\bFailed to\s/,
    hint: 'Write "We couldn\'t <verb> <thing>." and name the next step.',
  },
  {
    id: "focusArea",
    re: /\bfocus areas?\b/i,
    hint: "Organizations rename it. Build it from the org's label with singularLabelNoun or pluralLabelNoun from @dubgrid/domain.",
  },
];

/** Copy that names a banned term on purpose. */
const ALLOWED = [
  // Settings > Labels explains renaming by naming the default being renamed.
  /rename ['"]Focus Areas['"]/,
];

function findViolation(text, allowFocusArea) {
  if (!text || ALLOWED.some((re) => re.test(text))) return null;
  return (
    PATTERNS.find(({ id, re }) => !(allowFocusArea && id === "focusArea") && re.test(text)) ?? null
  );
}

/** The static text of a string-ish node, or null when it has none. */
function textOf(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "JSXExpressionContainer") return textOf(node.expression);
  if (node.type === "TemplateLiteral") {
    // `Select ${n} focus areas` is still hardcoded copy around the slots.
    return node.quasis.map((quasi) => quasi.value.cooked ?? "").join(" ");
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
export const noCopyStyleDrift = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow dashes, the ellipsis character, Please, Failed to and a hardcoded focus area in user-visible copy.",
    },
    messages: {
      drift: 'User-facing copy "{{text}}" breaks the house style. {{hint}}',
    },
    schema: [
      {
        type: "object",
        properties: { allowFocusArea: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    // Files that name the label setting itself, or legal and marketing pages
    // that speak about the product in general, may say "focus area".
    const allowFocusArea = context.options[0]?.allowFocusArea === true;

    function report(node, text) {
      const violation = findViolation(text, allowFocusArea);
      if (!violation) return;
      const shown = text.trim().replace(/\s+/g, " ");
      context.report({
        node,
        messageId: "drift",
        data: {
          text: shown.length > 60 ? `${shown.slice(0, 57)}...` : shown,
          hint: violation.hint,
        },
      });
    }

    function check(node) {
      const text = textOf(node);
      if (text != null) report(node, text);
    }

    return {
      JSXText(node) {
        report(node, node.value);
      },

      JSXAttribute(node) {
        if (node.name?.type !== "JSXIdentifier") return;
        if (!USER_VISIBLE_PROPS.has(node.name.name)) return;
        check(node.value);
      },

      CallExpression(node) {
        const callee = node.callee;
        if (
          callee?.type === "MemberExpression" &&
          callee.object?.type === "Identifier" &&
          callee.object.name === "toast" &&
          callee.property?.type === "Identifier" &&
          TOAST_METHODS.has(callee.property.name)
        ) {
          check(node.arguments[0]);
        }
      },

      Property(node) {
        if (node.computed) return;
        const key =
          node.key?.type === "Identifier"
            ? node.key.name
            : node.key?.type === "Literal"
              ? node.key.value
              : null;
        if (typeof key !== "string" || !USER_VISIBLE_KEYS.has(key)) return;
        check(node.value);
      },
    };
  },
};
