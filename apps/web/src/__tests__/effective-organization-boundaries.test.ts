import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const webSrc = path.join(repoRoot, "apps", "web", "src");
const scanRoots = [path.join(webSrc, "app", "api"), path.join(webSrc, "lib", "audit")];

/**
 * `requireOrgPermissions(req, requestedOrgId, ...)` may answer with a different
 * organization than the one the client named: a caller inside a Test Sandbox
 * is redirected to the sandbox, and the result's `orgId` is the only id that
 * was authorized. Reading or writing with the requested id after that call
 * is exactly how audit finding F-01 broke the sandbox boundary, so once the
 * call has been made the requested expression may not appear again except on
 * a logging line.
 *
 * Handlers that rewrite the parsed id in place before any check
 * (`resolveEffectiveOrgId` followed by `<expr> = effective`) are exempt: the
 * expression they pass is the effective id by construction.
 */
const authorizationCall =
  /requireOrgPermissions\(\s*(?:req|request)\s*,\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*,/g;
const loggingLine = /\b(?:logger\.(?:error|warn|info|debug)|Sentry\.captureException|extra:)/;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

function closingParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewritesInPlace(source: string, expression: string): boolean {
  // `(data as { orgId: string }).orgId = effective` names the same field as
  // `data.orgId`, so the assignment is matched on the final segment.
  const field = expression.split(".").pop() ?? expression;
  return (
    source.includes("resolveEffectiveOrgId(") &&
    new RegExp(`\\.${escapeRegExp(field)}\\s*=\\s*effective\\w*`).test(source)
  );
}

function requestedIdUsesAfterAuthorization(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const violations: string[] = [];
  for (const match of source.matchAll(authorizationCall)) {
    const requested = match[1];
    if (rewritesInPlace(source, requested)) continue;
    const callStart = source.indexOf("(", match.index ?? 0);
    const after = closingParen(source, callStart) + 1;
    // The check ends with the enclosing top-level function: a later handler
    // or helper that names its own parameter `orgId` is a different binding.
    const functionEnd = source.indexOf("\n}", after);
    const scope = source.slice(after, functionEnd < 0 ? undefined : functionEnd);
    // A trailing colon is an object key or a type annotation, not a read.
    const usage = new RegExp(`(?<![\\w$.])${escapeRegExp(requested)}(?![\\w$]|\\s*:)`, "g");
    for (const use of scope.matchAll(usage)) {
      const absolute = after + (use.index ?? 0);
      const lineStart = source.lastIndexOf("\n", absolute) + 1;
      const lineEnd = source.indexOf("\n", absolute);
      const line = source.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
      if (line.trimStart().startsWith("//") || loggingLine.test(line)) continue;
      if (/requireOrgPermissions\(/.test(line)) continue;
      const lineNumber = source.slice(0, absolute).split("\n").length;
      violations.push(`${path.relative(repoRoot, file)}:${lineNumber} uses ${requested}`);
    }
  }
  return violations;
}

describe("effective organization boundary", () => {
  it("never reuses the requested organization id after requireOrgPermissions", () => {
    const files = scanRoots.flatMap(listSourceFiles);
    const violations = files.flatMap(requestedIdUsesAfterAuthorization);
    expect(violations).toEqual([]);
  });

  it("returns the effective organization from the audit-log reader", () => {
    const source = readFileSync(path.join(webSrc, "lib", "audit", "authorize.ts"), "utf8");
    expect(source).toContain("orgId: auth.orgId");
    for (const route of ["day-counts", "full"]) {
      const handler = readFileSync(
        path.join(webSrc, "app", "api", "gridmaster", "audit-log", route, "route.ts"),
        "utf8",
      );
      expect(handler).toContain("reader.orgId");
      expect(handler).not.toMatch(/org_id",\s*parsed\.data\.orgId/);
    }
  });
});
