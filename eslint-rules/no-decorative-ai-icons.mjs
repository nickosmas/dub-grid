/**
 * ESLint rule: keep decorative "AI" iconography out of the product.
 *
 * The four-point sparkle (and its wand cousins) reads as "this is an AI
 * feature" everywhere else on the web. Nothing in DubGrid is AI-powered, so a
 * sparkle is pure decoration that makes the app look generated rather than
 * designed. Icons should name the thing they stand for — the card's subject,
 * or the control the reader would reach for next.
 *
 * Flags:
 *  - Ionicons glyph names (`sparkles`, `sparkles-outline`, `sparkles-sharp`)
 *    passed as a string literal to an `icon` / `iconName` / `name` prop.
 *  - Sparkle/wand named imports from lucide-react and lucide-react-native.
 *  - The sparkles and magic-wand emoji anywhere in source.
 *
 * Deliberately not flagged: `star*` glyphs (a star is a legitimate favorite or
 * rating affordance) and the word "magic" (MagicLinkEmail is the standard
 * Supabase term for passwordless sign-in).
 *
 * Note: the banned characters are written as escapes throughout, so this file
 * does not trip its own rule.
 */

/** Ionicons glyphs that render the AI sparkle. */
const BANNED_GLYPHS = new Set(["sparkles", "sparkles-outline", "sparkles-sharp"]);

/** JSX props that carry an icon name. */
const ICON_PROPS = new Set(["icon", "iconName", "name"]);

/** lucide-react / lucide-react-native exports that draw a sparkle or wand. */
const BANNED_LUCIDE_IMPORTS = new Set(["Sparkle", "Sparkles", "Wand", "Wand2", "WandSparkles"]);

const LUCIDE_PACKAGES = new Set(["lucide-react", "lucide-react-native"]);

/** U+2728 sparkles, U+1FA84 magic wand. */
const BANNED_CHARACTERS = /[\u2728\u{1FA84}]/u;

/** @type {import("eslint").Rule.RuleModule} */
export const noDecorativeAiIcons = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow sparkle/wand iconography, which makes the product read as AI-generated.",
    },
    messages: {
      bannedGlyph:
        'The "{{name}}" icon is the AI sparkle — it makes the app look generated. Use a glyph that names what the empty state is about, such as the card\'s own header icon or the control the reader would adjust.',
      bannedImport:
        '"{{name}}" is sparkle/wand iconography and reads as an AI feature. Pick an icon that describes the actual subject instead.',
      bannedCharacter:
        "Remove the sparkle/wand emoji — decorative AI iconography makes the product look generated.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      JSXAttribute(node) {
        if (!ICON_PROPS.has(node.name.name)) return;

        const value = node.value;
        if (!value) return;

        // Only string literals — `iconName={someVar}` is not statically known.
        const literal =
          value.type === "Literal"
            ? value.value
            : value.type === "JSXExpressionContainer" && value.expression.type === "Literal"
              ? value.expression.value
              : null;

        if (typeof literal !== "string" || !BANNED_GLYPHS.has(literal)) return;

        context.report({ node, messageId: "bannedGlyph", data: { name: literal } });
      },

      ImportDeclaration(node) {
        if (!LUCIDE_PACKAGES.has(node.source.value)) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;
          if (specifier.imported.type !== "Identifier") continue;

          const imported = specifier.imported.name;
          if (!BANNED_LUCIDE_IMPORTS.has(imported)) continue;

          context.report({
            node: specifier,
            messageId: "bannedImport",
            data: { name: imported },
          });
        }
      },

      Program() {
        // Scan the raw lines so the emoji is caught in strings, JSX text and
        // comments alike, rather than only where it is a string literal.
        for (const [index, line] of sourceCode.lines.entries()) {
          const column = line.search(BANNED_CHARACTERS);
          if (column === -1) continue;

          context.report({
            loc: { line: index + 1, column },
            messageId: "bannedCharacter",
          });
        }
      },
    };
  },
};
