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
 */
import { createElement } from "react";
import { render } from "@react-email/components";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { ConfirmationEmail } from "../src/emails/auth/ConfirmationEmail";
import { RecoveryEmail } from "../src/emails/auth/RecoveryEmail";
import { MagicLinkEmail } from "../src/emails/auth/MagicLinkEmail";
import { AuthInviteEmail } from "../src/emails/auth/AuthInviteEmail";
import { EmailChangeEmail } from "../src/emails/auth/EmailChangeEmail";
import { ReauthenticationEmail } from "../src/emails/auth/ReauthenticationEmail";

const TEMPLATES = [
  { file: "confirmation.html", Component: ConfirmationEmail, expects: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"] },
  { file: "recovery.html", Component: RecoveryEmail, expects: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"] },
  { file: "magic_link.html", Component: MagicLinkEmail, expects: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"] },
  { file: "invite.html", Component: AuthInviteEmail, expects: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"] },
  { file: "email_change.html", Component: EmailChangeEmail, expects: ["{{ .ConfirmationURL }}", "{{ .SiteURL }}"] },
  { file: "reauthentication.html", Component: ReauthenticationEmail, expects: ["{{ .Token }}", "{{ .SiteURL }}"] },
] as const;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(scriptDir, "..", "..", "..", "supabase", "templates");

describe("generate Supabase auth email templates", () => {
  it.each(TEMPLATES)(
    "renders $file with placeholders intact",
    async ({ file, Component, expects }) => {
      const html = await render(createElement(Component), { pretty: true });
      for (const placeholder of expects) {
        expect(html, `${file} lost placeholder ${placeholder}`).toContain(
          placeholder,
        );
      }
      writeFileSync(join(TEMPLATES_DIR, file), html, "utf8");
      // eslint-disable-next-line no-console
      console.log(`✓ wrote ${file}`);
    },
  );
});
