/**
 * ESLint rule: `"use client"` must be the first statement in the file.
 *
 * A directive only counts as one when nothing precedes it. Put an import above
 * it and it silently degrades into an ordinary expression statement -- the file
 * is still valid TypeScript, still renders under vitest, and still type-checks,
 * so every check this repo runs before a push passes. Only `next build` fails,
 * and Prettier makes it worse first by reformatting the now-pointless
 * expression as `("use client");`.
 *
 * That is exactly how two components lost their directive during a codemod that
 * inserted an import at the top of the file. This rule is the cheap guard: it
 * runs with the rest of lint instead of costing a full production build.
 */
export const noMisplacedUseClient = {
  meta: {
    type: "problem",
    docs: {
      description: '`"use client"` must be the first statement, or it stops being a directive.',
    },
    messages: {
      notFirst:
        '`"use client"` must be the first statement in the file. Anything above it -- an import, a comment is fine -- turns it into a plain expression, which only `next build` rejects.',
      parenthesised:
        '`("use client")` is an expression, not a directive. Write it bare as the first statement.',
    },
    schema: [],
    fixable: "code",
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      Program(node) {
        for (const [index, statement] of node.body.entries()) {
          if (statement.type !== "ExpressionStatement") continue;
          const expression = statement.expression;

          // A real directive is a bare string literal; Prettier wraps a
          // demoted one in parentheses, which is the tell.
          const wrapped =
            expression.type === "Literal" &&
            expression.value === "use client" &&
            sourceCode.getText(statement).startsWith("(");
          const bare =
            expression.type === "Literal" && expression.value === "use client" && !wrapped;

          if (!wrapped && !bare) continue;
          if (bare && index === 0) return;

          context.report({
            node: statement,
            messageId: wrapped ? "parenthesised" : "notFirst",
            fix(fixer) {
              const first = node.body[0];
              if (first === statement) return fixer.replaceText(statement, '"use client";');
              return [fixer.remove(statement), fixer.insertTextBefore(first, '"use client";\n\n')];
            },
          });
          return;
        }
      },
    };
  },
};
