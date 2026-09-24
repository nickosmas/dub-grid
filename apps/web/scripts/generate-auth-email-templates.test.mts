/**
 * Generates the Supabase auth email HTML in supabase/templates/ from the
 * react-email components, and asserts the Go placeholders survive rendering.
 *
 * Run via `npm run email:build` (NOT part of `npm test`, which is scoped to
 * src/). It runs under Vitest because Vitest's Vite resolver handles the
 * ESM-only @dubgrid/* workspace packages the components import — a plain
 * tsx/node runner resolves them through CJS and fails.
 *
 * Supabase substitutes its placeholders ({{ .ConfirmationURL }} etc.) at send
 * time, so they must be preserved verbatim in the output.
 *
 * The normal test run checks the committed HTML against the same list without
 * writing anything (`src/emails/auth/supabase-templates.test.ts`), so a source
 * change that skips this step fails CI.
 *
 * Each file is formatted with Prettier immediately after it is written, because
 * react-email's `pretty: true` uses a different style (single quotes, collapsed
 * CSS) than the repo's Prettier config. Without that step every run left the
 * six committed templates showing a ~750-line formatting-only diff that looked
 * like real work and wasn't.
 *
 * Two deliberate choices here:
 *
 * - Formatting runs *inside* this file rather than being chained onto the
 *   `email:build` npm script, so it still happens when the test is invoked
 *   directly (`vitest run scripts/generate-auth-email-templates.test.mts`),
 *   which is how the regression came back after the first fix.
 * - It shells out to the Prettier CLI rather than calling its Node API: under
 *   Vitest's resolver the API settles on a different (also stable) layout than
 *   the CLI produces, so only the CLI is guaranteed to agree with
 *   `prettier --check` and with a pre-commit hook.
 */
import { createElement } from "react";
import { render } from "@react-email/components";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { SUPABASE_AUTH_TEMPLATES } from "../src/emails/auth/supabase-templates";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(scriptDir, "..", "..", "..", "supabase", "templates");

const PRETTIER_BIN = createRequire(import.meta.url).resolve("prettier/bin/prettier.cjs");

/** Format a file in place with the Prettier CLI, the same way a hook would. */
function formatInPlace(filepath: string): void {
  execFileSync(process.execPath, [PRETTIER_BIN, "--write", filepath], { stdio: "pipe" });
}

describe("generate Supabase auth email templates", () => {
  it.each(SUPABASE_AUTH_TEMPLATES)(
    "renders the $key template with placeholders intact",
    async ({ key, Component, placeholders }) => {
      const file = `${key}.html`;
      const html = await render(createElement(Component), { pretty: true });
      const target = join(TEMPLATES_DIR, file);
      writeFileSync(target, html, "utf8");
      formatInPlace(target);

      // Assert against what actually lands on disk: Prettier reflows attributes
      // and text, so the placeholders have to survive formatting, not just the
      // raw render.
      const written = readFileSync(target, "utf8");
      for (const placeholder of placeholders) {
        expect(written, `${file} lost placeholder ${placeholder}`).toContain(placeholder);
      }
      // eslint-disable-next-line no-console
      console.log(`✓ wrote ${file}`);
    },
  );
});
