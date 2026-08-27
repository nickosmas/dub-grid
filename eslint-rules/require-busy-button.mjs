/**
 * ESLint rule: an action button that does async work must show a busy state.
 *
 * A button whose handler fires a request can be pressed twice before the first
 * one settles, running the action twice: two invites sent, two shifts
 * published, two rows created. A `useState` busy flag alone does not stop it —
 * the flag only reaches the DOM after React re-renders, and a fast second
 * click lands inside that window and sails past a `disabled` that has not been
 * applied yet. The fix is `useAsyncAction`, whose latch is a ref and therefore
 * synchronous, plus a visible busy state so the user knows work is underway.
 *
 * Flags:
 *  - a web `<button>` whose `onClick` is an async function (inline, or a
 *    handler declared `async` in the same file) and which carries neither a
 *    `disabled` attribute nor a `<ButtonLoading>` child;
 *  - a mobile `<Button>` does not need call-site busy handling: it latches an
 *    async `onPress` itself and renders its spinner beside the unchanged
 *    action label. This preserves the action vocabulary while still making
 *    progress visible.
 *
 * Deliberate limit: a rule sees one file at a time, so `onClick={onSave}`
 * where `onSave` arrives as a prop cannot be resolved and is not flagged. A
 * scan of this repo found 62 such prop-sourced buttons and nearly all were
 * `onClose` / `onNext` / `onToggle`, so flagging them would be noise with no
 * signal. In-file async handlers are the tractable, high-confidence case.
 *
 * Not flagged either: a synchronous handler. `useAsyncAction` is a no-op for
 * one (it returns before touching state), and a control that closes a panel or
 * flips a filter has nothing to double-execute.
 */

/** Wrappers that already render a spinner beside the label. */
const LOADING_WRAPPERS = new Set(["ButtonLoading", "ButtonSpinner"]);

function isAsyncNode(node) {
  return Boolean(
    node &&
    (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") &&
    node.async,
  );
}

/** Walks up to the nearest scope and looks for `name` bound to an async function. */
function resolveAsyncBinding(scope, name) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (!variable) continue;

    for (const def of variable.defs) {
      if (def.type === "FunctionName" && def.node.async) return true;
      if (def.type === "Variable" && def.node.init) {
        const init = def.node.init;
        if (isAsyncNode(init)) return true;
        // `useCallback(async () => {...}, [])`
        if (
          init.type === "CallExpression" &&
          init.callee.type === "Identifier" &&
          init.callee.name === "useCallback" &&
          isAsyncNode(init.arguments[0])
        ) {
          return true;
        }
      }
    }
    // The name was bound here and is not async; an outer binding is shadowed.
    return false;
  }
  return false;
}

/** True when the JSX attribute's value is, or resolves to, an async function. */
function attributeIsAsync(attribute, scope) {
  const value = attribute.value;
  if (!value || value.type !== "JSXExpressionContainer") return false;

  const expression = value.expression;
  if (isAsyncNode(expression)) return true;

  // `onClick={() => handleSave()}` — an arrow wrapping one async call.
  if (
    (expression.type === "ArrowFunctionExpression" || expression.type === "FunctionExpression") &&
    expression.body.type === "CallExpression" &&
    expression.body.callee.type === "Identifier"
  ) {
    return resolveAsyncBinding(scope, expression.body.callee.name);
  }

  if (expression.type === "Identifier") {
    return resolveAsyncBinding(scope, expression.name);
  }

  return false;
}

function getAttribute(openingElement, name) {
  return openingElement.attributes.find(
    (attribute) => attribute.type === "JSXAttribute" && attribute.name.name === name,
  );
}

/** True when any descendant of the element is a loading wrapper. */
function hasLoadingChild(element) {
  if (!element || !element.children) return false;

  return element.children.some((child) => {
    if (child.type !== "JSXElement") return false;
    const name = child.openingElement.name;
    if (name.type === "JSXIdentifier" && LOADING_WRAPPERS.has(name.name)) return true;
    return hasLoadingChild(child);
  });
}

/** @type {import("eslint").Rule.RuleModule} */
export const requireBusyButton = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a busy state on buttons whose handler does async work, so a double-press cannot run it twice.",
    },
    messages: {
      webButton:
        "This button's onClick is async, so a double-click can run it twice: `disabled` only applies after React re-renders. Wrap the handler in `useAsyncAction` and give the button `disabled={action.isRunning}` plus a `<ButtonLoading loading={action.isRunning} loadingLabel=\"Saving\">` (the progressive form of this button's own verb).",
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function scopeFor(node) {
      return sourceCode.getScope ? sourceCode.getScope(node) : context.getScope();
    }

    return {
      JSXOpeningElement(node) {
        const name = node.name;
        if (name.type !== "JSXIdentifier") return;

        if (name.name === "button") {
          const onClick = getAttribute(node, "onClick");
          if (!onClick || !attributeIsAsync(onClick, scopeFor(onClick))) return;
          if (getAttribute(node, "disabled")) return;
          if (hasLoadingChild(node.parent)) return;

          context.report({ node, messageId: "webButton" });
          return;
        }

        // Mobile Button owns the async latch and busy UI, including its
        // unchanged action label and spinner. No call-site configuration is
        // required (or desirable) for an async press.
      },
    };
  },
};
