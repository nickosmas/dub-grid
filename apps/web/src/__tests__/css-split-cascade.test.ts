import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * globals.css loads on every route and app-ui.css only inside the app, so
 * app-ui.css always wins a tie on source order. Two rules that can style the
 * same element with the same property, at the same specificity, therefore have
 * to live in the same file: split them and the cascade no longer follows the
 * order they are written in.
 *
 * This is not hypothetical. The split that created app-ui.css left
 * `.dg-nav-tab:hover` there while `.dg-nav-tab.active` stayed in globals.css,
 * and hovering the selected tab started painting it as merely hovered.
 */

const webSource = path.resolve(__dirname, "..");

interface Rule {
  file: string;
  context: string;
  selector: string;
  properties: Set<string>;
}

/** Rules with their at-rule context. Comments and strings are skipped so a
 *  brace or semicolon inside one cannot desynchronise the scan. */
function parseRules(css: string, file: string): Rule[] {
  const rules: Rule[] = [];
  const context: string[] = [];
  let head = "";
  let i = 0;

  const skipString = (quote: string) => {
    i += 1;
    while (i < css.length && css[i] !== quote) i += css[i] === "\\" ? 2 : 1;
    i += 1;
  };

  while (i < css.length) {
    const ch = css[i];

    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const start = i;
      skipString(ch);
      head += css.slice(start, i);
      continue;
    }
    if (ch === "{") {
      const selector = head.trim();
      head = "";
      i += 1;
      if (selector.startsWith("@")) {
        context.push(selector.replace(/\s+/g, " "));
        continue;
      }
      // A declaration block: read its property names, then resume.
      const properties = new Set<string>();
      let depth = 1;
      let buffer = "";
      while (i < css.length && depth > 0) {
        const c = css[i];
        if (c === "/" && css[i + 1] === "*") {
          const end = css.indexOf("*/", i + 2);
          i = end === -1 ? css.length : end + 2;
          continue;
        }
        if (c === '"' || c === "'") {
          skipString(c);
          continue;
        }
        if (c === "{") {
          depth += 1;
          buffer = "";
        } else if (c === "}") {
          depth -= 1;
          buffer = "";
        } else if (c === ";") {
          const property = buffer.split(":")[0]?.trim();
          if (property && !property.startsWith("--")) properties.add(property);
          buffer = "";
        } else {
          buffer += c;
        }
        i += 1;
      }
      rules.push({
        file,
        context: context.join(" && "),
        selector: selector.replace(/\s+/g, " "),
        properties,
      });
      continue;
    }
    if (ch === "}") {
      context.pop();
      head = "";
      i += 1;
      continue;
    }
    if (ch === ";" && head.trim().startsWith("@")) {
      head = "";
      i += 1;
      continue;
    }
    head += ch;
    i += 1;
  }

  return rules;
}

/** Specificity of the most specific comma-part, as one comparable number. */
function specificity(selector: string): number {
  let best = 0;
  for (const rawPart of selector.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    let ids = 0;
    let classes = 0;
    let elements = 0;
    let rest = part.replace(/:where\([^)]*\)/g, " ");
    rest = rest.replace(/:(?:is|matches|any|not)\(([^)]*)\)/g, (_match, inner: string) => {
      const sub = specificity(inner);
      ids += Math.floor(sub / 10000);
      classes += Math.floor((sub % 10000) / 100);
      elements += sub % 100;
      return " ";
    });
    ids += (rest.match(/#[\w-]+/g) ?? []).length;
    classes +=
      (rest.match(/\.[\w-]+/g) ?? []).length +
      (rest.match(/\[[^\]]+\]/g) ?? []).length +
      (rest.match(/:(?!:)[a-z-]+(?:\([^)]*\))?/g) ?? []).length;
    elements +=
      (rest.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length +
      (rest.match(/::[a-z-]+/g) ?? []).length;
    best = Math.max(best, ids * 10000 + classes * 100 + elements);
  }
  return best;
}

/**
 * The component classes of each comma-part's subject: the rightmost compound,
 * which is the element the rule actually styles. An ancestor mentioned earlier
 * in the selector narrows when the rule applies, it is not what the rule
 * paints, so `.dg-span-tabs .dg-scroll-chevron` and `.dg-span-tabs .dg-span-tab`
 * never contend for one element. Generic state words such as `.active` are
 * ignored on purpose: sharing one is not sharing a component.
 */
function subjectClasses(selector: string): Set<string> {
  const names = new Set<string>();
  for (const part of selector.split(",")) {
    const subject =
      part
        .trim()
        .split(/(?<![([,])[\s>+~]+(?![^([]*[)\]])/)
        .pop() ?? "";
    for (const match of subject.matchAll(/\.((?:dg|landing)-[\w-]+)/g)) names.add(match[1]);
  }
  return names;
}

describe("CSS split cascade safety", () => {
  const globals = parseRules(
    readFileSync(path.join(webSource, "app/globals.css"), "utf8"),
    "globals.css",
  );
  const appUi = parseRules(
    readFileSync(path.join(webSource, "app/app-ui.css"), "utf8"),
    "app-ui.css",
  );

  it("parses both stylesheets into rules", () => {
    // A scanner that silently gave up would make the real assertion vacuous.
    expect(globals.length).toBeGreaterThan(200);
    expect(appUi.length).toBeGreaterThan(200);
    expect(globals.every((rule) => !rule.selector.startsWith("@"))).toBe(true);
    expect(appUi.every((rule) => !rule.selector.startsWith("@"))).toBe(true);
  });

  it("keeps order-dependent rules for one component in the same stylesheet", () => {
    const all = [...globals, ...appUi];
    const conflicts = new Set<string>();

    for (let a = 0; a < all.length; a += 1) {
      for (let b = a + 1; b < all.length; b += 1) {
        const first = all[a];
        const second = all[b];
        if (first.file === second.file) continue;
        if (first.context !== second.context) continue;
        if (first.selector === second.selector) continue;

        const shared = [...subjectClasses(first.selector)].filter((name) =>
          subjectClasses(second.selector).has(name),
        );
        if (shared.length === 0) continue;

        const sameProperty = [...first.properties].some((property) =>
          second.properties.has(property),
        );
        if (!sameProperty) continue;

        // Different specificity: the cascade picks a winner regardless of which
        // file the rules landed in, so the split cannot change the outcome.
        if (specificity(first.selector) !== specificity(second.selector)) continue;

        conflicts.add(
          `${first.selector}  [${first.file}]  vs  ${second.selector}  [${second.file}]`,
        );
      }
    }

    expect([...conflicts].sort()).toEqual([]);
  });
});
