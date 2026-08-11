import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const webRoot = resolve(repoRoot, "apps/web");

const envFiles = [
  ".env.local",
  ".env.development.local",
  ".env.production.local",
  ".env.test.local",
  ".env.example",
];

function filesMatch(sourcePath, targetPath) {
  if (!existsSync(sourcePath) || !existsSync(targetPath)) {
    return false;
  }

  return readFileSync(sourcePath, "utf8") === readFileSync(targetPath, "utf8");
}

mkdirSync(webRoot, { recursive: true });

for (const fileName of envFiles) {
  const sourcePath = resolve(repoRoot, fileName);
  const targetPath = resolve(webRoot, fileName);

  if (!existsSync(sourcePath) || filesMatch(sourcePath, targetPath)) {
    continue;
  }

  copyFileSync(sourcePath, targetPath);
  console.log(`[sync-web-env] synced ${fileName} -> apps/web/${fileName}`);
}

// --- validation -------------------------------------------------------------
// Without this, a missing or mismatched key surfaces as a zod error in the
// browser console several seconds into `next dev`, pointing at env.ts rather
// than at the file actually at fault. Both failure modes below have bitten:
// a renamed variable left stale in `.env.local`, and a hosted key paired with
// a localhost URL (which fails at the first request, not at boot).

/** `KEY=value` pairs, ignoring comments and blanks. Quotes stripped. */
function readEnvFile(path) {
  if (!existsSync(path)) return null;
  const out = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (value.length > 1 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    out.set(trimmed.slice(0, eq).trim(), value);
  }
  return out;
}

/** Keys the app cannot boot without — mirrors the required half of env.ts. */
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
];

const localPath = resolve(repoRoot, ".env.local");
const env = readEnvFile(localPath);

if (!env) {
  console.error(
    "\n[sync-web-env] .env.local is missing. Copy .env.example to .env.local and fill it in.\n",
  );
  process.exit(1);
}

const problems = [];

for (const key of REQUIRED) {
  if (!env.get(key)) problems.push(`${key} is missing or empty`);
}

// A localhost stack issues `supabase-demo` JWTs and rejects hosted keys, so the
// two must agree. Mixing them "works" until the first request 401s.
const url = env.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
const isLocalUrl = /127\.0\.0\.1|localhost/.test(url);
for (const key of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
  const value = env.get(key);
  if (!value) continue;
  const isHostedKey = value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
  if (isLocalUrl && isHostedKey) {
    problems.push(`${key} is a hosted Supabase key but NEXT_PUBLIC_SUPABASE_URL points at local`);
  }
  if (!isLocalUrl && !isHostedKey && value.startsWith("eyJ")) {
    problems.push(
      `${key} is a local demo key but NEXT_PUBLIC_SUPABASE_URL points at a hosted project`,
    );
  }
}

// Anything in .env.example the local file has not caught up with. A warning,
// not a failure — plenty of example keys are genuinely optional.
const example = readEnvFile(resolve(repoRoot, ".env.example"));
if (example) {
  const missing = [...example.keys()].filter((k) => !env.has(k));
  if (missing.length > 0) {
    console.warn(`[sync-web-env] not set (may be optional): ${missing.join(", ")}`);
  }
}

if (problems.length > 0) {
  console.error("\n[sync-web-env] .env.local is not usable:\n");
  for (const problem of problems) console.error(`  \u2717 ${problem}`);
  console.error("\nFix .env.local (repo root) — apps/web/.env.local is a copy of it.\n");
  process.exit(1);
}
