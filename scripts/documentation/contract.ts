import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { DocumentationSourceInventory } from "./inventory";

const PAGE_LIFECYCLES = ["published", "planned", "redirect-source", "retired"] as const;
const SOURCE_REVIEW_STATES = ["pending", "verified"] as const;
const DELIVERY_OWNERS = ["40a", "40b", "40c", "40e"] as const;
const EXCLUSION_REASONS = [
  "internal-only",
  "framework-only",
  "legacy-redirect",
  "platform-boundary",
] as const;
const CLIENT_ROLES = ["staff", "admin", "super-admin"] as const;
const CLIENT_PLATFORMS = ["web", "ios", "android"] as const;
const SCHEDULING_STATES = [
  "normal",
  "unpublished",
  "draft",
  "published",
  "empty",
  "unavailable",
  "conflict",
  "loading",
  "error",
  "offline",
  "retry",
  "approval-pending",
  "expired",
] as const;

export const REQUIRED_SCHEDULING_CAPABILITY_IDS = [
  "schedule-reading-and-navigation",
  "schedule-authoring",
  "schedule-tools-and-outputs",
  "schedule-drafts-and-publishing",
  "schedule-recurring-patterns",
  "schedule-repeat-series",
  "schedule-realtime-collaboration",
  "schedule-coverage-and-open-shifts",
  "schedule-notes",
  "schedule-shift-requests",
  "schedule-configuration",
  "schedule-mobile-experience",
  "schedule-connected-surfaces",
] as const;

export type PageLifecycle = (typeof PAGE_LIFECYCLES)[number];
export type SourceReviewState = (typeof SOURCE_REVIEW_STATES)[number];
export type PlatformCoverage = "required" | "planned" | "not-applicable";

export interface ManifestSection {
  id: string;
  claims: string[];
  sourceFiles: string[];
  testFiles: string[];
  runtimeScenarios: string[];
  exclusions: string[];
}

export interface AccuracyManifestPage {
  id: string;
  file: string;
  publicRoute: string;
  deliveryOwner: (typeof DELIVERY_OWNERS)[number];
  lifecycle: PageLifecycle;
  sourceReview: SourceReviewState;
  evidenceFingerprint?: string;
  audiences: string[];
  platforms: {
    web: PlatformCoverage;
    ios: PlatformCoverage;
    android: PlatformCoverage;
  };
  surfaceIds: string[];
  sections: ManifestSection[];
}

export interface SurfaceExclusion {
  surfaceId: string;
  reasonCode: (typeof EXCLUSION_REASONS)[number];
  rationale: string;
  sourceFiles: string[];
}

export interface AccuracyManifest {
  schemaVersion: 1;
  frozenProductCandidate: string;
  runtimeProfiles: Record<string, unknown>;
  pages: AccuracyManifestPage[];
  surfaceExclusions: SurfaceExclusion[];
}

export interface SchedulingCapability {
  id: string;
  group: string;
  roles: string[];
  platforms: string[];
  states: string[];
  sourceFiles: string[];
  testFiles: string[];
  documentation: {
    file: string;
    anchor: string;
  };
}

export interface SchedulingCapabilityCoverage {
  schemaVersion: 1;
  capabilities: SchedulingCapability[];
}

export interface ContractReport {
  errors: string[];
  counts: {
    published: number;
    planned: number;
    pending: number;
    verified: number;
    exclusions: number;
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function publicMdxFiles(repoRoot: string): string[] {
  const docsRoot = path.join(repoRoot, "docs");
  const results: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith(".mdx")) results.push(path.relative(repoRoot, absolute));
    }
  };
  visit(docsRoot);
  return results.sort();
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sourceSurfaceIds(inventory: DocumentationSourceInventory): Set<string> {
  return new Set([
    ...inventory.webRoutes.map((item) => item.id),
    ...inventory.mobileRoutes.map((item) => item.id),
    ...inventory.settingsSections.map((item) => item.id),
  ]);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isInsideRepository(repoRoot: string, file: string): boolean {
  const relative = path.relative(repoRoot, path.resolve(repoRoot, file));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** The Mintlify route a page file serves: `docs/a/index.mdx` is `/a`. */
export function publicRouteForFile(file: string): string {
  const route = file
    .replace(/^docs\//, "")
    .replace(/\.mdx$/, "")
    .replace(/(^|\/)index$/, "");
  return `/${route}`;
}

function enumErrors(page: AccuracyManifestPage): string[] {
  const errors: string[] = [];
  if (!isOneOf(PAGE_LIFECYCLES, page.lifecycle))
    errors.push(`${page.id} has unknown lifecycle ${String(page.lifecycle)}`);
  if (!isOneOf(SOURCE_REVIEW_STATES, page.sourceReview))
    errors.push(`${page.id} has unknown sourceReview ${String(page.sourceReview)}`);
  if (!isOneOf(DELIVERY_OWNERS, page.deliveryOwner))
    errors.push(`${page.id} has unknown deliveryOwner ${String(page.deliveryOwner)}`);
  if (page.lifecycle === "planned" && page.sourceReview === "verified")
    errors.push(`planned page ${page.id} cannot be verified`);
  return errors.map((message) => `accuracy-manifest.json: ${message}`);
}

export function loadAccuracyManifest(repoRoot: string): AccuracyManifest {
  return readJson<AccuracyManifest>(
    path.join(repoRoot, "internal/documentation/accuracy-manifest.json"),
  );
}

export function loadSchedulingCapabilityCoverage(repoRoot: string): SchedulingCapabilityCoverage {
  return readJson<SchedulingCapabilityCoverage>(
    path.join(repoRoot, "internal/documentation/scheduling-capability-coverage.json"),
  );
}

function validateEnumList(
  value: unknown,
  allowed: readonly string[],
  label: string,
  capabilityId: string,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [`scheduling-capability-coverage.json: ${capabilityId} has no ${label}`];
  }
  const errors: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item)) {
      errors.push(
        `scheduling-capability-coverage.json: ${capabilityId} has unknown ${label} ${String(item)}`,
      );
    }
  }
  return errors;
}

function validateEvidenceList(
  repoRoot: string,
  value: unknown,
  label: "sourceFiles" | "testFiles",
  capabilityId: string,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [`scheduling-capability-coverage.json: ${capabilityId} has no ${label}`];
  }
  const errors: string[] = [];
  for (const file of value) {
    if (typeof file !== "string" || !isInsideRepository(repoRoot, file)) {
      errors.push(
        `scheduling-capability-coverage.json: ${capabilityId} ${label} file is outside the repository: ${String(file)}`,
      );
    } else if (!existsSync(path.join(repoRoot, file))) {
      errors.push(
        `scheduling-capability-coverage.json: ${capabilityId} references missing ${label} file ${file}`,
      );
    }
  }
  return errors;
}

export function validateSchedulingCapabilityCoverage(
  repoRoot: string,
  coverage: SchedulingCapabilityCoverage,
  manifest: AccuracyManifest,
): string[] {
  const errors: string[] = [];
  if (coverage.schemaVersion !== 1) {
    errors.push("scheduling-capability-coverage.json: schemaVersion must be 1");
  }
  if (!Array.isArray(coverage.capabilities)) {
    return [...errors, "scheduling-capability-coverage.json: capabilities must be an array"];
  }

  const publishedPages = new Map(
    manifest.pages
      .filter((page) => page.lifecycle === "published")
      .map((page) => [page.file, page]),
  );
  const capabilityIds = coverage.capabilities.map((capability) => capability.id);
  for (const duplicate of duplicateValues(capabilityIds)) {
    errors.push(`scheduling-capability-coverage.json: duplicate capability id ${duplicate}`);
  }
  for (const requiredId of REQUIRED_SCHEDULING_CAPABILITY_IDS) {
    if (!capabilityIds.includes(requiredId)) {
      errors.push(`scheduling-capability-coverage.json: missing required capability ${requiredId}`);
    }
  }
  for (const capability of coverage.capabilities) {
    const capabilityId = typeof capability.id === "string" ? capability.id : String(capability.id);
    if (!capabilityId.trim()) {
      errors.push("scheduling-capability-coverage.json: capability id must be non-empty");
    } else if (!REQUIRED_SCHEDULING_CAPABILITY_IDS.includes(capabilityId as never)) {
      errors.push(`scheduling-capability-coverage.json: unknown capability id ${capabilityId}`);
    }
    if (!capability.group?.trim()) {
      errors.push(`scheduling-capability-coverage.json: ${capabilityId} needs a group`);
    }
    errors.push(
      ...validateEnumList(capability.roles, CLIENT_ROLES, "role", capabilityId),
      ...validateEnumList(capability.platforms, CLIENT_PLATFORMS, "platform", capabilityId),
      ...validateEnumList(capability.states, SCHEDULING_STATES, "state", capabilityId),
      ...validateEvidenceList(repoRoot, capability.sourceFiles, "sourceFiles", capabilityId),
      ...validateEvidenceList(repoRoot, capability.testFiles, "testFiles", capabilityId),
    );
    const target = capability.documentation;
    if (!target?.file || !target.anchor?.trim()) {
      errors.push(
        `scheduling-capability-coverage.json: ${capabilityId} needs a documentation target`,
      );
    } else if (!publishedPages.has(target.file)) {
      errors.push(
        `scheduling-capability-coverage.json: ${capabilityId} documentation target is not a published page: ${target.file}`,
      );
    }
  }
  return errors.sort();
}

export function validateAccuracyManifest(
  repoRoot: string,
  inventory: DocumentationSourceInventory,
  manifest: AccuracyManifest,
  options: { requireClosed?: boolean } = {},
): ContractReport {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push("accuracy-manifest.json: schemaVersion must be 1");
  if (!/^[0-9a-f]{40}$/.test(manifest.frozenProductCandidate)) {
    errors.push("accuracy-manifest.json: frozenProductCandidate must be a full Git commit hash");
  }

  for (const duplicate of duplicateValues(manifest.pages.map((page) => page.id))) {
    errors.push(`accuracy-manifest.json: duplicate page id ${duplicate}`);
  }
  for (const duplicate of duplicateValues(manifest.pages.map((page) => page.publicRoute))) {
    errors.push(`accuracy-manifest.json: duplicate public route ${duplicate}`);
  }

  const currentFiles = publicMdxFiles(repoRoot);
  const registeredCurrent = manifest.pages
    .filter((page) => page.lifecycle !== "planned")
    .map((page) => page.file)
    .sort();
  for (const file of currentFiles.filter((item) => !registeredCurrent.includes(item))) {
    errors.push(`accuracy-manifest.json: current public page is not registered: ${file}`);
  }
  for (const file of registeredCurrent.filter((item) => !currentFiles.includes(item))) {
    errors.push(`accuracy-manifest.json: registered current page does not exist: ${file}`);
  }
  for (const duplicate of duplicateValues(registeredCurrent)) {
    errors.push(`accuracy-manifest.json: public page registered more than once: ${duplicate}`);
  }

  const inventoryIds = sourceSurfaceIds(inventory);
  const covered = new Set<string>();
  const documented = new Set<string>();
  for (const page of manifest.pages) {
    errors.push(...enumErrors(page));
    if (page.publicRoute !== publicRouteForFile(page.file)) {
      errors.push(
        `accuracy-manifest.json: ${page.id} publicRoute ${page.publicRoute} does not match ${page.file}`,
      );
    }
    if (page.lifecycle === "planned" && !["40b", "40c", "40e"].includes(page.deliveryOwner)) {
      errors.push(`accuracy-manifest.json: planned page ${page.id} needs owner 40b, 40c, or 40e`);
    }
    if (!isInsideRepository(repoRoot, page.file)) {
      errors.push(
        `accuracy-manifest.json: ${page.id} file is outside the repository: ${page.file}`,
      );
    } else if (page.lifecycle !== "planned" && !existsSync(path.join(repoRoot, page.file))) {
      errors.push(`accuracy-manifest.json: ${page.id} file does not exist: ${page.file}`);
    }
    if (page.audiences.length === 0)
      errors.push(`accuracy-manifest.json: ${page.id} has no audiences`);
    if (page.sections.length === 0)
      errors.push(`accuracy-manifest.json: ${page.id} has no section evidence`);
    if (page.sourceReview === "verified" && !page.evidenceFingerprint) {
      errors.push(`accuracy-manifest.json: verified page ${page.id} has no evidence fingerprint`);
    }
    for (const section of page.sections) {
      if (
        section.claims.length === 0 ||
        section.sourceFiles.length === 0 ||
        !Array.isArray(section.testFiles) ||
        !Array.isArray(section.runtimeScenarios) ||
        !Array.isArray(section.exclusions)
      ) {
        errors.push(
          `accuracy-manifest.json: ${page.id} section ${section.id} has incomplete evidence fields`,
        );
      }
      for (const file of [...section.sourceFiles, ...section.testFiles]) {
        if (!isInsideRepository(repoRoot, file)) {
          errors.push(
            `accuracy-manifest.json: ${page.id} evidence file is outside the repository: ${file}`,
          );
        } else if (!existsSync(path.join(repoRoot, file))) {
          errors.push(
            `accuracy-manifest.json: ${page.id} references missing evidence file ${file}`,
          );
        }
      }
    }
    for (const surfaceId of page.surfaceIds) {
      if (!inventoryIds.has(surfaceId)) {
        errors.push(`accuracy-manifest.json: ${page.id} references unknown surface ${surfaceId}`);
      }
      covered.add(surfaceId);
      documented.add(surfaceId);
    }
  }

  for (const exclusion of manifest.surfaceExclusions) {
    if (!inventoryIds.has(exclusion.surfaceId)) {
      errors.push(
        `accuracy-manifest.json: exclusion references unknown surface ${exclusion.surfaceId}`,
      );
    }
    if (!isOneOf(EXCLUSION_REASONS, exclusion.reasonCode)) {
      errors.push(
        `accuracy-manifest.json: exclusion ${exclusion.surfaceId} has unknown reasonCode ${String(exclusion.reasonCode)}`,
      );
    }
    if (documented.has(exclusion.surfaceId)) {
      errors.push(`accuracy-manifest.json: ${exclusion.surfaceId} is both excluded and documented`);
    }
    if (!exclusion.rationale.trim()) {
      errors.push(`accuracy-manifest.json: exclusion ${exclusion.surfaceId} needs a rationale`);
    }
    for (const file of exclusion.sourceFiles) {
      if (!isInsideRepository(repoRoot, file)) {
        errors.push(
          `accuracy-manifest.json: exclusion ${exclusion.surfaceId} file is outside the repository: ${file}`,
        );
      } else if (!existsSync(path.join(repoRoot, file))) {
        errors.push(
          `accuracy-manifest.json: exclusion ${exclusion.surfaceId} references missing file ${file}`,
        );
      }
    }
    covered.add(exclusion.surfaceId);
  }

  for (const id of [...inventoryIds].filter((item) => !covered.has(item)).sort()) {
    errors.push(
      `accuracy-manifest.json: source surface has no documentation destination or exclusion: ${id}`,
    );
  }

  const counts = {
    published: manifest.pages.filter((page) => page.lifecycle === "published").length,
    planned: manifest.pages.filter((page) => page.lifecycle === "planned").length,
    pending: manifest.pages.filter((page) => page.sourceReview === "pending").length,
    verified: manifest.pages.filter((page) => page.sourceReview === "verified").length,
    exclusions: manifest.surfaceExclusions.length,
  };
  if (options.requireClosed && (counts.planned > 0 || counts.pending > 0)) {
    errors.push(
      `accuracy-manifest.json: contract is not closed (${counts.planned} planned, ${counts.pending} pending)`,
    );
  }
  if (options.requireClosed) {
    for (const page of manifest.pages) {
      if (page.lifecycle !== "planned" && page.sourceReview !== "verified") {
        errors.push(`accuracy-manifest.json: ${page.id} must be verified to close the contract`);
      }
    }
  }
  return { errors: errors.sort(), counts };
}
