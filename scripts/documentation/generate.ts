import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildDocumentationInventory,
  renderInventoryJson,
  renderInventoryMarkdown,
} from "./inventory";

export const GENERATED_INVENTORY_JSON = "internal/documentation/generated/app-inventory.json";
export const GENERATED_INVENTORY_MARKDOWN = "internal/documentation/generated/app-inventory.md";

export function generatedInventory(repoRoot: string): {
  json: string;
  markdown: string;
} {
  const inventory = buildDocumentationInventory(repoRoot);
  return {
    json: renderInventoryJson(inventory),
    markdown: renderInventoryMarkdown(inventory),
  };
}

function main(): void {
  const repoRoot = process.cwd();
  if (!process.argv.includes("--write")) {
    throw new Error("Pass --write to update the committed documentation inventory.");
  }
  const generated = generatedInventory(repoRoot);
  const jsonPath = path.join(repoRoot, GENERATED_INVENTORY_JSON);
  const markdownPath = path.join(repoRoot, GENERATED_INVENTORY_MARKDOWN);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, generated.json);
  writeFileSync(markdownPath, generated.markdown);
  process.stdout.write(
    "Updated " + GENERATED_INVENTORY_JSON + " and " + GENERATED_INVENTORY_MARKDOWN + ".\n",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
