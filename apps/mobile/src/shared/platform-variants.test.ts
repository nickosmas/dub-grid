// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const MOBILE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VARIANT = /\.(ios|android|native|web)\.tsx?$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" ? [] : walk(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function resolveModule(from: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

/** The names a module exports, following `export *` from local files. */
function exportedNames(file: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file)) return names;
  seen.add(file);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause && statement.moduleSpecifier) {
        const target = resolveModule(file, (statement.moduleSpecifier as ts.StringLiteral).text);
        if (target) exportedNames(target, seen).forEach((name) => names.add(name));
      } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        statement.exportClause.elements.forEach((element) => names.add(element.name.text));
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      names.add("default");
      continue;
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      names.add("default");
    } else if (ts.isVariableStatement(statement)) {
      statement.declarationList.declarations.forEach((declaration) => {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      });
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

const variants = [
  ...walk(path.join(MOBILE_ROOT, "app")),
  ...walk(path.join(MOBILE_ROOT, "src")),
].filter((file) => VARIANT.test(file));

describe("platform files", () => {
  it("finds the platform files", () => {
    expect(variants.length).toBeGreaterThan(0);
  });

  // TypeScript checks callers against the base file only, so a name a
  // platform file forgets is undefined on that phone with no type error.
  it.each(variants.map((file) => [path.relative(MOBILE_ROOT, file), file]))(
    "%s exports everything its base file exports",
    (_name, file) => {
      const base = file.replace(VARIANT, (match) =>
        match.replace(/\.(ios|android|native|web)/, ""),
      );
      const missing = [...exportedNames(base)].filter((name) => !exportedNames(file).has(name));
      expect(missing).toEqual([]);
    },
  );
});
