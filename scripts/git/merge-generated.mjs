// Git merge driver for files the documentation tooling generates. Two
// branches that touch the same page's evidence both rewrite its fingerprint,
// and no text merge can combine two hashes: the right value is a new hash of
// the merged code. So the driver keeps this branch's copy and records what to
// rebuild; `rebuild-generated.mjs` rebuilds it from the merged tree before the
// merge commit. Usage (from .gitattributes): merge-generated.mjs %O %A %B %P

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ACCURACY_MANIFEST = "internal/documentation/accuracy-manifest.json";
export const INVENTORY_FILES = [
  "internal/documentation/generated/app-inventory.json",
  "internal/documentation/generated/app-inventory.md",
];
const PENDING_FILE = "dubgrid-generated-pending.json";

export class ManifestConflict extends Error {
  constructor(where) {
    super(`Both sides changed ${where} differently.`);
    this.where = where;
  }
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdList(value) {
  return Array.isArray(value) && value.every((item) => isPlainObject(item) && "id" in item);
}

function mergeObjects(base, ours, theirs, where, onFingerprint) {
  const merged = {};
  const keys = [...Object.keys(ours), ...Object.keys(theirs).filter((key) => !(key in ours))];
  for (const key of keys) {
    const value = mergeValue(base?.[key], ours[key], theirs[key], [...where, key], onFingerprint);
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function mergeIdLists(base, ours, theirs, where, onFingerprint) {
  const byId = (list) => new Map((list ?? []).map((item) => [item.id, item]));
  const [baseItems, ourItems, theirItems] = [byId(base), byId(ours), byId(theirs)];
  const ids = [...ourItems.keys(), ...[...theirItems.keys()].filter((id) => !ourItems.has(id))];
  const merged = [];
  for (const id of ids) {
    const value = mergeValue(
      baseItems.get(id),
      ourItems.get(id),
      theirItems.get(id),
      [...where, id],
      onFingerprint,
    );
    if (value !== undefined) merged.push(value);
  }
  return merged;
}

function mergeValue(base, ours, theirs, where, onFingerprint) {
  if (sameValue(ours, theirs)) return ours;
  if (sameValue(base, ours)) return theirs;
  if (sameValue(base, theirs)) return ours;
  if (where.at(-1) === "evidenceFingerprint" && where[0] === "pages") {
    onFingerprint(where[1]);
    return ours;
  }
  if (isPlainObject(ours) && isPlainObject(theirs)) {
    return mergeObjects(isPlainObject(base) ? base : undefined, ours, theirs, where, onFingerprint);
  }
  if (isIdList(ours) && isIdList(theirs) && (base === undefined || isIdList(base))) {
    return mergeIdLists(base, ours, theirs, where, onFingerprint);
  }
  throw new ManifestConflict(where.join(" > ") || "the manifest");
}

/**
 * Three-way merges the accuracy manifest. Returns the merged text and the
 * pages whose fingerprints both sides changed, which must be recorded again.
 * Throws ManifestConflict for any other overlapping change.
 */
export function mergeManifestText(baseText, oursText, theirsText) {
  const pages = new Set();
  const merged = mergeValue(
    JSON.parse(baseText),
    JSON.parse(oursText),
    JSON.parse(theirsText),
    [],
    (id) => pages.add(id),
  );
  return { text: `${JSON.stringify(merged, null, 2)}\n`, pages: [...pages] };
}

export function pendingPath() {
  const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], { encoding: "utf8" }).trim();
  return path.join(gitDir, PENDING_FILE);
}

export function readPending() {
  const file = pendingPath();
  if (!existsSync(file)) return { inventory: false, pages: [] };
  return JSON.parse(readFileSync(file, "utf8"));
}

function recordPending({ inventory = false, pages = [] }) {
  const current = readPending();
  const next = {
    inventory: current.inventory || inventory,
    pages: [...new Set([...current.pages, ...pages])],
  };
  writeFileSync(pendingPath(), `${JSON.stringify(next)}\n`);
}

function textMerge(ours, base, theirs) {
  const result = spawnSync("git", [
    "merge-file",
    "-L",
    "ours",
    "-L",
    "base",
    "-L",
    "theirs",
    ours,
    base,
    theirs,
  ]);
  return result.status === 0;
}

function main([base, ours, theirs, file]) {
  if (INVENTORY_FILES.includes(file)) {
    const original = readFileSync(ours);
    if (textMerge(ours, base, theirs)) return 0;
    writeFileSync(ours, original);
    recordPending({ inventory: true });
    return 0;
  }
  if (file === ACCURACY_MANIFEST) {
    try {
      const { text, pages } = mergeManifestText(
        readFileSync(base, "utf8"),
        readFileSync(ours, "utf8"),
        readFileSync(theirs, "utf8"),
      );
      writeFileSync(ours, text);
      if (pages.length > 0) recordPending({ pages });
      return 0;
    } catch (error) {
      if (!(error instanceof ManifestConflict)) throw error;
      process.stderr.write(`merge-generated: ${file}: ${error.message}\n`);
      textMerge(ours, base, theirs);
      return 1;
    }
  }
  return textMerge(ours, base, theirs) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
