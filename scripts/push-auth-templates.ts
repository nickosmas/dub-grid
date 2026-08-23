import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";

/**
 * Syncs the auth-email half of `supabase/config.toml` to the linked remote
 * Supabase project: the six compiled templates in `supabase/templates/`, their
 * subject lines, and the OTP length/expiry those emails are written around.
 *
 * Why this and not `supabase config push`: that command pushes the *entire*
 * `[auth]` block, and ours holds local-dev values — `site_url` of 127.0.0.1, a
 * loopback-only redirect allow-list, session timeboxes production has switched
 * off, and rate limits an order of magnitude below production's. Pushing it
 * whole would take production down. Managing all of that from the repo needs a
 * reconciled `[remotes.production]` block; this script covers the part the repo
 * is unambiguously the source of truth for.
 *
 * Read-only by default. Pass `--apply` to write.
 *
 *   npx tsx --env-file=.env.remote scripts/push-auth-templates.ts
 *   npx tsx --env-file=.env.remote scripts/push-auth-templates.ts --apply
 */

const CONFIG_PATH = resolve("supabase/config.toml");
const TEMPLATE_KEYS = [
  "confirmation",
  "invite",
  "magic_link",
  "email_change",
  "recovery",
  "reauthentication",
] as const;

type TemplateKey = (typeof TEMPLATE_KEYS)[number];

type Change = { field: string; from: string; to: string; note?: string };

/**
 * Reads `subject` and `content_path` out of each `[auth.email.template.*]`
 * block, plus the `otp_*` values from `[auth.email]`, so config.toml stays the
 * one place these are declared. A hand-rolled reader rather than a TOML
 * dependency: the shapes involved are two flat key/value forms.
 */
function readConfig() {
  const toml = readFileSync(CONFIG_PATH, "utf-8");

  const section = (name: string): string => {
    const start = toml.indexOf(`[${name}]`);
    if (start === -1) throw new Error(`config.toml has no [${name}] section`);
    const rest = toml.slice(start + name.length + 2);
    const end = rest.indexOf("\n[");
    return end === -1 ? rest : rest.slice(0, end);
  };

  const value = (body: string, key: string): string | null => {
    const match = body.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n#]*)"?`, "m"));
    return match ? match[1].trim() : null;
  };

  const templates = TEMPLATE_KEYS.map((key) => {
    const body = section(`auth.email.template.${key}`);
    const subject = value(body, "subject");
    const contentPath = value(body, "content_path");
    if (!subject || !contentPath) {
      throw new Error(`[auth.email.template.${key}] is missing subject or content_path`);
    }
    return { key, subject, content: readFileSync(resolve(contentPath), "utf-8") };
  });

  const email = section("auth.email");
  return {
    templates,
    otpLength: Number(value(email, "otp_length")),
    otpExpiry: Number(value(email, "otp_expiry")),
  };
}

function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url?.includes("supabase.co")) {
    console.error("ERROR: .env.remote is not pointing to a remote Supabase project.");
    console.error("Run via: npx tsx --env-file=.env.remote scripts/push-auth-templates.ts");
    process.exit(1);
  }
  return new URL(url).hostname.split(".")[0];
}

function authToken(): string {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("ERROR: SUPABASE_ACCESS_TOKEN is not set (expected in .env.remote).");
    console.error("Generate one at https://supabase.com/dashboard/account/tokens");
    process.exit(1);
  }
  return token;
}

async function managementApi(ref: string, token: string, init?: RequestInit) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    // The body can echo project config; surface the status and a short reason only.
    throw new Error(`Management API ${init?.method ?? "GET"} failed: ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

/** A one-line preview, since template bodies run to ~13 KB. */
function summarize(field: string, value: string): string {
  return field.endsWith("_content") ? `${value.length} bytes` : value;
}

function diff(
  live: Record<string, unknown>,
  config: ReturnType<typeof readConfig>,
): { changes: Change[]; payload: Record<string, string | number> } {
  const changes: Change[] = [];
  const payload: Record<string, string | number> = {};

  const compare = (field: string, next: string | number, note?: string) => {
    const current = live[field];
    const same =
      typeof next === "number" ? current === next : String(current ?? "").trim() === next.trim();
    if (same) return;
    payload[field] = next;
    changes.push({
      field,
      from: summarize(field, String(current ?? "")),
      to: summarize(field, String(next)),
      note,
    });
  };

  for (const { key, subject, content } of config.templates) {
    compare(`mailer_templates_${key}_content`, content);
    compare(`mailer_subjects_${key}`, subject);
  }

  compare(
    "mailer_otp_length",
    config.otpLength,
    "mobile ResetPasswordScreen hard-codes a 6-character code (CODE_LENGTH)",
  );
  // The API names this one `_exp`, not `_expiry` like config.toml does.
  compare("mailer_otp_exp", config.otpExpiry);

  return { changes, payload };
}

async function confirmApply(ref: string, count: number): Promise<void> {
  if (process.env.CONFIRM_AUTH_CONFIG === "yes") return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.warn(`\n⚠️  This updates live auth config on REMOTE project "${ref}" (${count} fields).`);
  const answer = await rl.question(`Type the project ref "${ref}" to confirm: `);
  rl.close();
  if (answer.trim() !== ref) {
    console.error("Confirmation did not match. Aborting.");
    process.exit(1);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const ref = projectRef();
  const token = authToken();
  const config = readConfig();

  console.log(`Project: ${ref}`);
  const live = await managementApi(ref, token);
  const { changes, payload } = diff(live, config);

  if (changes.length === 0) {
    console.log("Remote auth email config already matches the repo. Nothing to do.");
    return;
  }

  console.log(`\n${changes.length} field(s) differ from the repo:\n`);
  for (const change of changes) {
    console.log(`  ${change.field}`);
    console.log(`    remote: ${change.from}`);
    console.log(`    repo:   ${change.to}`);
    if (change.note) console.log(`    note:   ${change.note}`);
  }

  if (!apply) {
    console.log("\nRead-only run. Re-run with --apply to write these to the project.");
    return;
  }

  await confirmApply(ref, changes.length);
  await managementApi(ref, token, { method: "PATCH", body: JSON.stringify(payload) });
  console.log(`\nUpdated ${changes.length} field(s) on ${ref}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
