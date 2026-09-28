import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  isInsideRepository,
  loadAccuracyManifest,
  validateAccuracyManifest,
  type AccuracyManifest,
  type AccuracyManifestPage,
} from "./contract";
import {
  generatedInventory,
  GENERATED_INVENTORY_JSON,
  GENERATED_INVENTORY_MARKDOWN,
} from "./generate";
import type { DocumentationSourceInventory } from "./inventory";

export interface DocumentationDiagnostic {
  rule: string;
  file: string;
  message: string;
}

export interface DocumentationCheckResult {
  diagnostics: DocumentationDiagnostic[];
  counts: ReturnType<typeof validateAccuracyManifest>["counts"];
}

export function checkGeneratedArtifacts(
  repoRoot: string,
  expected: { json: string; markdown: string },
): DocumentationDiagnostic[] {
  const diagnostics: DocumentationDiagnostic[] = [];
  const jsonPath = path.join(repoRoot, GENERATED_INVENTORY_JSON);
  const markdownPath = path.join(repoRoot, GENERATED_INVENTORY_MARKDOWN);
  if (!existsSync(jsonPath) || readFileSync(jsonPath, "utf8") !== expected.json) {
    diagnostics.push(
      diagnostic(
        "generated-inventory",
        GENERATED_INVENTORY_JSON,
        "stale generated inventory; run npm run docs:inventory",
      ),
    );
  }
  if (!existsSync(markdownPath) || readFileSync(markdownPath, "utf8") !== expected.markdown) {
    diagnostics.push(
      diagnostic(
        "generated-inventory",
        GENERATED_INVENTORY_MARKDOWN,
        "stale generated inventory; run npm run docs:inventory",
      ),
    );
  }
  return diagnostics;
}

function diagnostic(rule: string, file: string, message: string): DocumentationDiagnostic {
  return { rule, file, message };
}

function walk(directory: string, predicate: (file: string) => boolean): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute, predicate));
    else if (predicate(absolute)) files.push(absolute);
  }
  return files.sort();
}

function navTargets(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(navTargets);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const direct = Array.isArray(record.pages)
    ? record.pages.filter((item): item is string => typeof item === "string")
    : [];
  return [...direct, ...Object.values(record).flatMap(navTargets)];
}

function frontmatter(content: string): { title?: string; description?: string } | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const values: { title?: string; description?: string } = {};
  for (const line of content.slice(4, end).split("\n")) {
    const match = line.match(/^(title|description):\s*["']?(.+?)["']?\s*$/);
    if (match) values[match[1] as "title" | "description"] = match[2];
  }
  return values;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function anchors(content: string): Set<string> {
  const values = new Set<string>();
  for (const line of content.split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading) values.add(slug(heading[1]));
    for (const match of line.matchAll(/\bid=["']([^"']+)["']/g)) values.add(match[1]);
  }
  return values;
}

function publicFileForHref(repoRoot: string, fromFile: string, hrefPath: string): string | null {
  const withoutSlash = hrefPath.replace(/^\//, "").replace(/\/$/, "");
  const absolute = hrefPath.startsWith("/")
    ? path.join(repoRoot, "docs", withoutSlash)
    : path.resolve(path.dirname(fromFile), hrefPath);
  const candidates = [absolute, `${absolute}.mdx`, path.join(absolute, "index.mdx")];
  return (
    candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
  );
}

function checkLinks(
  repoRoot: string,
  relativeFile: string,
  content: string,
): DocumentationDiagnostic[] {
  const diagnostics: DocumentationDiagnostic[] = [];
  const absoluteFile = path.join(repoRoot, relativeFile);
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1].trim().replace(/^<|>$/g, "");
    if (/^(https?:|mailto:|tel:)/.test(raw)) continue;
    const [hrefPath, fragment] = raw.split("#", 2);
    const target = hrefPath ? publicFileForHref(repoRoot, absoluteFile, hrefPath) : absoluteFile;
    if (!target) {
      diagnostics.push(diagnostic("local-link", relativeFile, `broken local link ${raw}`));
      continue;
    }
    if (fragment && !anchors(readFileSync(target, "utf8")).has(fragment)) {
      diagnostics.push(
        diagnostic(
          "local-anchor",
          relativeFile,
          `missing anchor #${fragment} in ${path.relative(repoRoot, target)}`,
        ),
      );
    }
  }
  return diagnostics;
}

export function checkDocumentedCommands(
  file: string,
  content: string,
  inventory: DocumentationSourceInventory,
): DocumentationDiagnostic[] {
  const diagnostics: DocumentationDiagnostic[] = [];
  const knownCommands = new Map(
    inventory.supportedCommands.map((item) => [item.invocation, item.status]),
  );
  for (const match of content.matchAll(/\bnpm run ([a-zA-Z0-9:_-]+)/g)) {
    const invocation = `npm run ${match[1]}`;
    const status = knownCommands.get(invocation);
    if (!status)
      diagnostics.push(diagnostic("documented-command", file, `unknown command ${invocation}`));
    else if (status !== "supported") {
      diagnostics.push(
        diagnostic(
          "documented-command",
          file,
          `${invocation} is classified ${status}, not supported`,
        ),
      );
    }
  }
  return diagnostics;
}

export function checkDocumentedPaths(
  repoRoot: string,
  file: string,
  content: string,
  inventory: DocumentationSourceInventory,
): DocumentationDiagnostic[] {
  const diagnostics: DocumentationDiagnostic[] = [];
  const webPaths = new Set(inventory.webRoutes.map((item) => item.path));
  for (const match of content.matchAll(/`(\/[^`\s|]+)`/g)) {
    const claimedPath = match[1].replace(/[.,;:]$/, "");
    if (claimedPath.startsWith("/api/")) continue;
    if (!webPaths.has(claimedPath)) {
      diagnostics.push(
        diagnostic("documented-path", file, `unknown application path ${claimedPath}`),
      );
    }
  }
  for (const match of content.matchAll(/`([^`\n]+\.(?:ts|tsx|md|mdx|json|ya?ml))`/g)) {
    const claimedPath = match[1];
    if (!claimedPath.startsWith("http") && !existsSync(path.join(repoRoot, claimedPath))) {
      diagnostics.push(
        diagnostic("documented-path", file, `missing repository path ${claimedPath}`),
      );
    }
  }
  return diagnostics;
}

export function checkApiClaims(
  file: string,
  content: string,
  inventory: DocumentationSourceInventory,
): DocumentationDiagnostic[] {
  const diagnostics: DocumentationDiagnostic[] = [];
  const knownMethods = new Set(inventory.httpMethods.map((item) => `${item.method} ${item.path}`));
  for (const line of content.split("\n")) {
    const route = line.match(/`(\/api\/[^`]+)`/);
    const method = line.match(/`(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)`/);
    if (route && method && !knownMethods.has(`${method[1]} ${route[1]}`)) {
      diagnostics.push(
        diagnostic("api-method", file, `unknown API contract ${method[1]} ${route[1]}`),
      );
    }
  }
  return diagnostics;
}

export function checkPermissionClaims(
  file: string,
  content: string,
  inventory: DocumentationSourceInventory,
): DocumentationDiagnostic[] {
  const diagnostics: DocumentationDiagnostic[] = [];
  const permissionKeys = new Set(inventory.permissions.map((item) => item.key));
  for (const match of content.matchAll(/`(can[A-Z][A-Za-z]+)`/g)) {
    if (!permissionKeys.has(match[1])) {
      diagnostics.push(diagnostic("permission", file, `unknown permission ${match[1]}`));
    }
  }
  return diagnostics;
}

export function checkProhibitedPublicInternals(
  file: string,
  content: string,
): DocumentationDiagnostic[] {
  const diagnostics: DocumentationDiagnostic[] = [];
  const prohibited: Array<[RegExp, string]> = [
    [/\/gridmaster\b/i, "Gridmaster route"],
    [/\bTest Sandbox\b/i, "Test Sandbox tooling"],
    [/\bfeature flags?\b/i, "feature flags"],
    [/\bprocess\.env\b/i, "environment variables"],
    [/`\/api\//i, "internal HTTP endpoints"],
  ];
  for (const [pattern, label] of prohibited) {
    if (pattern.test(content))
      diagnostics.push(diagnostic("public-internals", file, `public guide exposes ${label}`));
  }
  return diagnostics;
}

function semanticDiagnostics(
  repoRoot: string,
  page: AccuracyManifestPage,
  content: string,
  inventory: DocumentationSourceInventory,
): DocumentationDiagnostic[] {
  if (page.sourceReview !== "verified") return [];
  return [
    ...checkDocumentedCommands(page.file, content, inventory),
    ...checkDocumentedPaths(repoRoot, page.file, content, inventory),
    ...checkApiClaims(page.file, content, inventory),
    ...checkPermissionClaims(page.file, content, inventory),
    ...checkProhibitedPublicInternals(page.file, content),
  ];
}

function pageEvidenceFiles(page: AccuracyManifestPage): string[] {
  const files = new Set<string>([page.file]);
  for (const section of page.sections) {
    for (const file of [...section.sourceFiles, ...section.testFiles]) files.add(file);
  }
  return [...files];
}

export function computePageFingerprint(
  repoRoot: string,
  page: AccuracyManifestPage,
  inventory: DocumentationSourceInventory,
): string {
  const fileEvidence = pageEvidenceFiles(page)
    .sort()
    .map((file) => [file, readFileSync(path.join(repoRoot, file), "utf8")]);
  const inventoryEvidence = [
    ...inventory.webRoutes,
    ...inventory.mobileRoutes,
    ...inventory.settingsSections,
  ].filter((item) => page.surfaceIds.includes(item.id));
  const { evidenceFingerprint: _ignored, ...pageWithoutFingerprint } = page;
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ page: pageWithoutFingerprint, fileEvidence, inventoryEvidence }))
    .digest("hex")}`;
}

export function checkPublicDocumentation(
  repoRoot: string,
  inventory: DocumentationSourceInventory,
  manifest: AccuracyManifest,
): DocumentationDiagnostic[] {
  const diagnostics: DocumentationDiagnostic[] = [];
  const docsConfigPath = path.join(repoRoot, "docs/docs.json");
  const docsConfig = JSON.parse(readFileSync(docsConfigPath, "utf8")) as unknown;
  const targets = [...new Set(navTargets(docsConfig))].sort();
  const currentMdx = walk(path.join(repoRoot, "docs"), (file) => file.endsWith(".mdx"));
  const relativeMdx = currentMdx.map((file) => path.relative(repoRoot, file));

  for (const target of targets) {
    if (!existsSync(path.join(repoRoot, "docs", `${target}.mdx`))) {
      diagnostics.push(
        diagnostic(
          "navigation-target",
          "docs/docs.json",
          `navigation target does not exist: ${target}`,
        ),
      );
    }
  }
  for (const file of relativeMdx) {
    const target = file.replace(/^docs\//, "").replace(/\.mdx$/, "");
    if (target !== "index" && !targets.includes(target)) {
      diagnostics.push(
        diagnostic("orphan-page", file, "page is not reachable from Mintlify navigation"),
      );
    }
    const content = readFileSync(path.join(repoRoot, file), "utf8");
    const metadata = frontmatter(content);
    if (!metadata?.title || !metadata.description) {
      diagnostics.push(
        diagnostic("frontmatter", file, "frontmatter requires non-empty title and description"),
      );
    }
    diagnostics.push(...checkLinks(repoRoot, file, content));
  }

  for (const page of manifest.pages.filter((item) => item.lifecycle !== "planned")) {
    const absolute = path.join(repoRoot, page.file);
    if (!existsSync(absolute)) continue;
    const content = readFileSync(absolute, "utf8");
    diagnostics.push(...semanticDiagnostics(repoRoot, page, content, inventory));
    const evidenceReadable = pageEvidenceFiles(page).every(
      (file) => isInsideRepository(repoRoot, file) && existsSync(path.join(repoRoot, file)),
    );
    // A missing or out-of-repo evidence file is already a manifest error.
    if (page.sourceReview === "verified" && evidenceReadable) {
      const expected = computePageFingerprint(repoRoot, page, inventory);
      if (page.evidenceFingerprint !== expected) {
        diagnostics.push(
          diagnostic(
            "evidence-fingerprint",
            page.file,
            `source evidence changed; expected ${expected}`,
          ),
        );
      }
    }
  }
  return diagnostics;
}

export function checkDocumentationContract(
  repoRoot: string,
  options: { requireClosed?: boolean } = {},
): DocumentationCheckResult {
  const diagnostics: DocumentationDiagnostic[] = [];
  const generated = generatedInventory(repoRoot);
  diagnostics.push(...checkGeneratedArtifacts(repoRoot, generated));

  const inventory = JSON.parse(generated.json) as DocumentationSourceInventory;
  const manifest = loadAccuracyManifest(repoRoot);
  const contract = validateAccuracyManifest(repoRoot, inventory, manifest, options);
  diagnostics.push(
    ...contract.errors.map((message) =>
      diagnostic("accuracy-manifest", "internal/documentation/accuracy-manifest.json", message),
    ),
  );
  diagnostics.push(...checkPublicDocumentation(repoRoot, inventory, manifest));
  return {
    diagnostics: diagnostics.sort((left, right) =>
      `${left.file}:${left.rule}:${left.message}`.localeCompare(
        `${right.file}:${right.rule}:${right.message}`,
      ),
    ),
    counts: contract.counts,
  };
}

function main(): void {
  const result = checkDocumentationContract(process.cwd(), {
    requireClosed: process.argv.includes("--require-closed"),
  });
  for (const item of result.diagnostics) {
    process.stderr.write(`${item.file} [${item.rule}] ${item.message}\n`);
  }
  process.stdout.write(
    `Documentation contract: ${result.counts.published} published, ${result.counts.planned} planned, ${result.counts.pending} pending, ${result.counts.verified} verified, ${result.counts.exclusions} exclusions.\n`,
  );
  if (result.diagnostics.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
