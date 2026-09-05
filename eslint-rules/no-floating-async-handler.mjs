/**
 * ESLint rule: a JSX handler that starts async work must return its promise.
 *
 * The shared primitives (`<Button>`, `<ConfirmDialog>`, `<ConfirmationModal>`,
 * `<PressableRow>`) stop a double-press by latching the handler with
 * `useAsyncAction`. That latch holds only for as long as the promise the
 * handler hands back, and a handler that fires the work and returns nothing
 * hands back `undefined` — so the latch releases on the next microtask and the
 * second press runs the action again. The button still looks guarded, which is
 * what makes this worth a rule: `disabled={isPending}` is right there, and it
 * is not enough, because that flag only reaches the DOM after a re-render.
 *
 *   onConfirm={() => { setOpen(false); handlePublish(); }}   // publishes twice
 *   onConfirm={() => { setOpen(false); return handlePublish(); }}
 *
 * Flags a block-bodied, non-async handler that calls an in-file async function
 * (or wraps one in `void`) as a bare statement rather than returning it, and a
 * concise arrow body that discards the call through `void`:
 *
 *   onClick={() => void createLink()}    // reads like a return, is not one
 *   onClick={() => createLink()}
 *
 * Not flagged: an `async` handler (it returns a promise already), a bare
 * concise arrow body (`() => save()` returns it), a synchronous call, or a
 * handler whose callee is a prop this file cannot resolve.
 */

const HANDLER_PROPS = new Set([
  "onClick",
  "onPress",
  "onConfirm",
  "onSecondaryConfirm",
  "onAction",
  "onSubmit",
]);

function isAsyncFn(node) {
  return Boolean(
    node &&
    (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") &&
    node.async,
  );
}

/** True when `name` resolves, in an enclosing scope, to an async function. */
function resolvesToAsync(scope, name) {
  for (let cur = scope; cur; cur = cur.upper) {
    const variable = cur.set.get(name);
    if (!variable) continue;
    for (const def of variable.defs) {
      if (def.type === "FunctionName" && def.node.async) return true;
      if (def.type === "Variable" && def.node.init) {
        const init = def.node.init;
        if (isAsyncFn(init)) return true;
        if (
          init.type === "CallExpression" &&
          init.callee.type === "Identifier" &&
          (init.callee.name === "useCallback" || init.callee.name === "useMemo") &&
          isAsyncFn(init.arguments[0])
        ) {
          return true;
        }
      }
    }
    return false;
  }
  return false;
}

/** The call inside a statement, unwrapping a `void` operator. */
function callOf(statement) {
  if (statement.type !== "ExpressionStatement") return null;
  let expr = statement.expression;
  if (expr.type === "UnaryExpression" && expr.operator === "void") expr = expr.argument;
  return expr.type === "CallExpression" ? expr : null;
}

export const noFloatingAsyncHandler = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A JSX handler that starts async work must return its promise, so the double-press latch can hold.",
    },
    messages: {
      floating:
        "`{{name}}()` is async but its promise is dropped, so the double-press latch releases immediately and a second press runs it again. Return it (`return {{name}}(...)`) or make the handler `async`.",
      voided:
        "`void` discards `{{name}}()`'s promise, so the latch releases immediately and the button never shows it is working. Drop the `void` (`() => {{name}}(...)`).",
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !HANDLER_PROPS.has(node.name.name)) return;
        const value = node.value;
        if (!value || value.type !== "JSXExpressionContainer") return;

        const fn = value.expression;
        if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") return;
        // An async handler already hands its promise back.
        if (fn.async) return;

        const scope = sourceCode.getScope ? sourceCode.getScope(fn.body) : context.getScope();

        // A concise body returns whatever it evaluates to, so `() => save()` is
        // fine -- but `void` discards the promise while still looking like one
        // of those, which is the shape that slipped past this rule.
        if (fn.body.type !== "BlockStatement") {
          if (fn.body.type !== "UnaryExpression" || fn.body.operator !== "void") return;
          const call = fn.body.argument;
          if (call.type !== "CallExpression" || call.callee.type !== "Identifier") return;
          const name = call.callee.name;
          if (!resolvesToAsync(scope, name)) return;
          context.report({ node: fn.body, messageId: "voided", data: { name } });
          return;
        }

        for (const statement of fn.body.body) {
          const call = callOf(statement);
          if (!call) continue;

          // Only a bare identifier callee can be resolved with confidence;
          // `props.onSave()` or `query.refetch()` are out of this file's reach.
          if (call.callee.type !== "Identifier") continue;
          const name = call.callee.name;
          if (!resolvesToAsync(scope, name)) continue;

          context.report({ node: statement, messageId: "floating", data: { name } });
        }
      },
    };
  },
};
