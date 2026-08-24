/**
 * ESLint rules: keep implementation detail out of the words a customer reads.
 *
 * Two rules live here.
 *
 * `no-technical-user-copy` flags a string literal in a user-visible position
 * that names something only a developer would recognise, or that reports a
 * failure without saying what to do next. The dominant offender was
 * "Failed to <verb> <thing>": passive-adjacent, blames the reader, and leaves
 * them with no move. These reach the screen from three places — a toast, a
 * rendered prop, and `{ error: "..." }` in a route handler, which the client
 * shows verbatim.
 *
 * `no-raw-error-in-toast` flags a toast built out of a caught error without
 * passing it through `formatClientErrorMessage`. That helper is what stops a
 * Postgres, PostgREST, or Zod message from reaching a customer; skipping it is
 * how "duplicate key value violates unique constraint" ends up on screen.
 */

// ── Shared position tables ───────────────────────────────────────────────────

/** JSX props whose string value is rendered to the reader. */
const USER_VISIBLE_PROPS = new Set([
  "actionLabel",
  "aria-label",
  "cancelLabel",
  "confirmLabel",
  "confirmPendingLabel",
  "description",
  "emptyLabel",
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
const USER_VISIBLE_KEYS = new Set(["error", "message", "title", "description", "loadingLabel"]);

const TOAST_METHODS = new Set(["error", "success", "info", "warning", "message", "loading"]);

// ── What counts as technical ─────────────────────────────────────────────────

const TECHNICAL_PATTERNS = [
  {
    id: "failedTo",
    re: /^\s*failed to\b/i,
    hint: 'Write it as "We couldn\'t <verb> <thing>." and name the next step ("Try again.", "Refresh and try again.").',
  },
  {
    id: "jargon",
    re: /\b(?:JWT|RPC|payload|endpoint|uuid|org_id|postgres|supabase|schema cache|stack trace|null|undefined|NaN)\b/,
    hint: "Name what the reader sees, not the mechanism behind it.",
  },
  {
    id: "bareStatus",
    re: /^\s*(?:unauthorized|forbidden|invalid (?:query|body|input|request|data|parameters)|internal error|query failed|bad request)\s*\.?\s*$/i,
    hint: "Use an API_ERRORS constant from @dubgrid/client-errors instead of a bare status word.",
  },
  {
    id: "hedged",
    // Hedging with no next step: "Service temporarily unavailable", "Please
    // try again later". Names the mechanism, tells the reader nothing.
    re: /\b(?:temporarily unavailable|please try again (?:later|shortly|in a (?:bit|while)))\b|^\s*service unavailable\s*\.?\s*$/i,
    hint: "Say what the reader can do now. Use API_ERRORS.SERVICE_UNAVAILABLE for a fail-closed 503.",
  },
  {
    id: "workspace",
    re: /\bworkspace\b/i,
    hint: 'The tenant is an "Organization" in all user-facing copy.',
  },
];

/**
 * Copy that reads as technical but is legitimately about the subject, or is a
 * developer-facing diagnostic rather than product copy.
 */
const ALLOWED = [
  /adblocker/i,
  /\.env\.local/,
  /EXPO_PUBLIC_/,
  /Terms of Service/i,
  /Privacy Policy/i,
  /crash reporting/i,
];

function isAllowed(text) {
  return ALLOWED.some((re) => re.test(text));
}

function findViolation(text) {
  if (text.trim().length < 4) return null;
  if (isAllowed(text)) return null;
  return TECHNICAL_PATTERNS.find(({ re }) => re.test(text)) ?? null;
}

/** The string literal a node ultimately is, if it is one. */
function literalOf(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node;
  if (node.type === "JSXExpressionContainer") return literalOf(node.expression);
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.length === 1 ? node : null;
  }
  return null;
}

function textOf(node) {
  if (node.type === "Literal") return node.value;
  if (node.type === "TemplateLiteral") return node.quasis[0].value.cooked ?? "";
  return "";
}

/** @type {import("eslint").Rule.RuleModule} */
export const noTechnicalUserCopy = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow implementation detail and next-step-free failure copy in user-visible strings.",
    },
    messages: {
      technical: 'User-facing copy "{{text}}" leaks implementation detail. {{hint}}',
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      const literal = literalOf(node);
      if (!literal) return;
      const text = textOf(literal);
      const violation = findViolation(text);
      if (!violation) return;
      context.report({
        node: literal,
        messageId: "technical",
        data: {
          text: text.length > 60 ? `${text.slice(0, 57)}…` : text,
          hint: violation.hint,
        },
      });
    }

    return {
      // <Button label="Failed to save" />
      JSXAttribute(node) {
        if (node.name?.type !== "JSXIdentifier") return;
        if (!USER_VISIBLE_PROPS.has(node.name.name)) return;
        check(node.value);
      },

      // toast.error("Failed to save")
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

      // { error: "Failed to load users" } / pushToast({ message: "…" })
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

// ── no-raw-error-in-toast ────────────────────────────────────────────────────

const SAFE_FORMATTERS = new Set([
  "formatClientErrorMessage",
  "buildClientErrorToast",
  "buildClientErrorToastInput",
  "clientSafeError",
]);

/** True when the expression reads a message off a caught error. */
function readsRawError(node, depth = 0) {
  if (!node || depth > 4) return false;

  switch (node.type) {
    case "MemberExpression":
      return (
        node.property?.type === "Identifier" &&
        node.property.name === "message" &&
        node.object?.type === "Identifier" &&
        /^(err|error|e|ex|cause)$/i.test(node.object.name)
      );
    case "CallExpression": {
      const callee = node.callee;
      const name =
        callee?.type === "Identifier"
          ? callee.name
          : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
            ? callee.property.name
            : null;
      // A safe formatter anywhere in the expression clears it.
      if (name && SAFE_FORMATTERS.has(name)) return false;
      if (name === "String") return node.arguments.some((a) => readsRawError(a, depth + 1));
      return node.arguments.some((a) => readsRawError(a, depth + 1));
    }
    case "ConditionalExpression":
      return (
        readsRawError(node.test, depth + 1) ||
        readsRawError(node.consequent, depth + 1) ||
        readsRawError(node.alternate, depth + 1)
      );
    case "LogicalExpression":
    case "BinaryExpression":
      return readsRawError(node.left, depth + 1) || readsRawError(node.right, depth + 1);
    case "TemplateLiteral":
      return node.expressions.some((e) => readsRawError(e, depth + 1));
    default:
      return false;
  }
}

function containsSafeFormatter(node, depth = 0) {
  if (!node || depth > 5) return false;
  if (node.type === "CallExpression") {
    const callee = node.callee;
    const name =
      callee?.type === "Identifier"
        ? callee.name
        : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
          ? callee.property.name
          : null;
    if (name && SAFE_FORMATTERS.has(name)) return true;
    return node.arguments.some((a) => containsSafeFormatter(a, depth + 1));
  }
  if (node.type === "ConditionalExpression") {
    return (
      containsSafeFormatter(node.consequent, depth + 1) ||
      containsSafeFormatter(node.alternate, depth + 1)
    );
  }
  if (node.type === "TemplateLiteral") {
    return node.expressions.some((e) => containsSafeFormatter(e, depth + 1));
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
export const noRawErrorInToast = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require caught errors to pass through formatClientErrorMessage before reaching a toast.",
    },
    messages: {
      rawError:
        "This shows a caught error's message directly. Wrap it in formatClientErrorMessage(error, \"<friendly fallback>\") so a Postgres, PostgREST, or Zod message can't reach the reader.",
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      if (!node) return;
      if (containsSafeFormatter(node)) return;
      if (!readsRawError(node)) return;
      context.report({ node, messageId: "rawError" });
    }

    return {
      CallExpression(node) {
        const callee = node.callee;

        // toast.error(err.message)
        if (
          callee?.type === "MemberExpression" &&
          callee.object?.type === "Identifier" &&
          callee.object.name === "toast" &&
          callee.property?.type === "Identifier" &&
          TOAST_METHODS.has(callee.property.name)
        ) {
          check(node.arguments[0]);
          return;
        }

        // pushToast({ message: err.message })
        if (callee?.type === "Identifier" && /^(pushToast|showToast)$/.test(callee.name)) {
          const arg = node.arguments[0];
          if (arg?.type !== "ObjectExpression") return;
          for (const prop of arg.properties) {
            if (prop.type !== "Property" || prop.computed) continue;
            const key = prop.key?.type === "Identifier" ? prop.key.name : null;
            if (key === "message" || key === "title") check(prop.value);
          }
        }
      },
    };
  },
};
