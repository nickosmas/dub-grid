// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { SUPABASE_AUTH_TEMPLATES } from "./supabase-templates";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const templatesDir = path.join(repoRoot, "supabase", "templates");
const configToml = readFileSync(path.join(repoRoot, "supabase", "config.toml"), "utf8");
const prettierBin = createRequire(import.meta.url).resolve("prettier/bin/prettier.cjs");

/** Rendered text with Prettier's line wrapping collapsed, for phrase checks. */
function templateText(file: string): string {
  return readFileSync(path.join(templatesDir, file), "utf8").replace(/\s+/g, " ");
}

/** Formats as `npm run email:build` does, without writing: stdin, named as the target. */
function formatLikeTheGenerator(html: string, target: string): string {
  return execFileSync(process.execPath, [prettierBin, "--stdin-filepath", target], {
    input: html,
    encoding: "utf8",
  });
}

function configBlock(header: string): string {
  const start = configToml.indexOf(header);
  if (start === -1) return "";
  const rest = configToml.slice(start + header.length);
  const end = rest.indexOf("\n[");
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Production receives the committed HTML, not the React source, so a wording,
 * expiry or link fix in a component must not pass CI while the deployable
 * template stays stale. Regenerate with `npm run email:build`.
 */
describe("Supabase auth email templates", () => {
  it.each(SUPABASE_AUTH_TEMPLATES)(
    "the $key template matches its source",
    async ({ key, Component }) => {
      const target = path.join(templatesDir, `${key}.html`);
      const expected = formatLikeTheGenerator(
        await render(createElement(Component), { pretty: true }),
        target,
      );

      expect(readFileSync(target, "utf8"), `run npm run email:build`).toBe(expected);
    },
    20_000,
  );

  it.each(SUPABASE_AUTH_TEMPLATES)(
    "the $key template keeps its Supabase placeholders",
    ({ key, placeholders }) => {
      const html = readFileSync(path.join(templatesDir, `${key}.html`), "utf8");
      for (const placeholder of placeholders) {
        expect(html, `${key}.html lost ${placeholder}`).toContain(placeholder);
      }
    },
  );

  // The CLI reads security notices only from `[auth.email.notification.*]`;
  // declared as templates they were silently ignored (41c1).
  it.each(SUPABASE_AUTH_TEMPLATES)(
    "$key is wired into config.toml with a subject",
    ({ key, notification }) => {
      const header = notification
        ? `[auth.email.notification.${notification.type}]`
        : `[auth.email.template.${key}]`;
      const block = configBlock(header);
      expect(block, `config.toml has no ${header}`).not.toBe("");
      expect(block).toMatch(/^subject\s*=\s*"[^"]+"/m);
      // The CLI resolves a notification's path from supabase/, a template's
      // from the repository root.
      const templatePath = notification ? "./templates" : "./supabase/templates";
      expect(block).toContain(`content_path = "${templatePath}/${key}.html"`);
      if (notification) {
        expect(block).toMatch(new RegExp(`^enabled = ${notification.enabled}$`, "m"));
        expect(configToml).not.toContain(`[auth.email.template.${key}]`);
      }
    },
  );

  it("pushes exactly the templates it renders", () => {
    const pushScript = readFileSync(
      path.join(repoRoot, "scripts", "push-auth-templates.ts"),
      "utf8",
    );
    const keysBlock = pushScript.match(/const TEMPLATE_KEYS = \[([\s\S]*?)\] as const/)?.[1] ?? "";
    const pushed = [...keysBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort();

    expect(pushed).toEqual(SUPABASE_AUTH_TEMPLATES.map(({ key }) => key).sort());
  });

  it("syncs each security notice's enabled flag from its notification section", () => {
    const pushScript = readFileSync(
      path.join(repoRoot, "scripts", "push-auth-templates.ts"),
      "utf8",
    );

    expect(pushScript).toContain("auth.email.notification.${notificationType}");
    expect(pushScript).toContain("mailer_notifications_${notification.type}_enabled");
    for (const { key, notification } of SUPABASE_AUTH_TEMPLATES) {
      if (notification) expect(key).toBe(`${notification.type}_notification`);
    }
  });

  // These go to a DubGrid sign-in, which no organization controls, so they must
  // never send someone to "your administrator" for a credential problem.
  it.each(SUPABASE_AUTH_TEMPLATES)(
    "the $key template never defers to an administrator",
    ({ key }) => {
      expect(templateText(`${key}.html`)).not.toMatch(/your administrator/i);
    },
  );

  it("states the recovery expiry that config.toml actually sets", () => {
    expect(templateText("recovery.html")).toContain("expire in 1 hour");
    expect(configToml).toMatch(/^otp_expiry = 3600$/m);
  });

  it("never tells someone to ignore an identity code they did not request", () => {
    const text = templateText("reauthentication.html");
    expect(text).not.toMatch(/safely ignore/i);
    expect(text).toContain("someone may know your password");
  });

  // Supabase's invite email cannot be given a verified organization name, so it
  // stays unused; invitations go through the app's own email, which names one.
  it("sends no invitation through Supabase's generic invite email", () => {
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "__tests__") continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) sources.push(full);
      }
    };
    walk(path.join(repoRoot, "apps", "web", "src"));
    walk(path.join(repoRoot, "packages"));
    const callers = sources.filter((file) =>
      readFileSync(file, "utf8").includes("inviteUserByEmail"),
    );
    expect(callers).toEqual([]);
  });
});
