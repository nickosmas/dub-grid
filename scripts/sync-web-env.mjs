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
