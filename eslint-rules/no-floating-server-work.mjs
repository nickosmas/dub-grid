/**
 * ESLint rule: server work is awaited or handed to `after()`.
 *
 * On Vercel a function may be frozen as soon as its response is sent, so a
 * promise the handler started and never awaited can stop halfway. Alerts,
 * emails and audit rows were started that way (`void dispatchNotificationEvent(...)`)
 * and could be dropped without an error (F-145, F-177). `after()` from
 * `next/server` keeps the function alive until the task settles.
 *
 *   void dispatchNotificationEvent(actorId, event);          // may never send
 *   after(() => dispatchNotificationEvent(actorId, event));
 *
 * Flags, as a statement on its own:
 *  - `void <call>`, the explicit way to drop a promise;
 *  - a call chain that starts work and ends in `.then(...)`, `.catch(...)` or
 *    `.finally(...)`, which handles the result without anyone waiting for it.
 *
 * Not flagged: an awaited or returned call, one passed to `after()`,
 * `Promise.all` or another call that takes ownership of it, and a handler
 * attached to a promise held in a variable (`facts.catch(...)`), which is
 * awaited elsewhere and only kept from going unhandled.
 */

const SETTLE_METHODS = new Set(["then", "catch", "finally"]);

function isSettleChain(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    SETTLE_METHODS.has(node.callee.property.name) &&
    node.callee.object.type === "CallExpression"
  );
}

export const noFloatingServerWork = {
  meta: {
    type: "problem",
    docs: {
      description: "Await server work or hand it to after(), so it is not cut off",
    },
    schema: [],
    messages: {
      floating:
        "Work left running after the response may be cut off. Await it, or hand it to after() from next/server.",
    },
  },
  create(context) {
    return {
      ExpressionStatement(node) {
        const { expression } = node;
        const voidedCall =
          expression.type === "UnaryExpression" &&
          expression.operator === "void" &&
          expression.argument.type === "CallExpression";
        if (voidedCall || isSettleChain(expression)) {
          context.report({ node, messageId: "floating" });
        }
      },
    };
  },
};
