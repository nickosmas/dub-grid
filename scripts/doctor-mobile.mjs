import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  getCandidateIpv4Addresses,
  isLoopbackHost,
  isPhoneUnreachableIpv4Address,
  isPrivateIpv4Address,
} from "./use-mobile-local.mjs";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const mobileEnvPath = resolve(repoRoot, "apps/mobile/.env.local");

const PROBE_TIMEOUT_MS = 4000;

function parseEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const start = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

function classifyHost(host) {
  if (isLoopbackHost(host)) {
    return {
      tone: "fail",
      note: "Loopback host — points back to the phone, not your laptop.",
    };
  }
  if (isPhoneUnreachableIpv4Address(host)) {
    return {
      tone: "fail",
      note: "Likely from a VPN or iCloud Private Relay — your phone can't reach it.",
    };
  }
  if (isPrivateIpv4Address(host)) {
    const active = new Set(
      getCandidateIpv4Addresses().map((c) => c.address),
    );
    if (!active.has(host)) {
      return {
        tone: "warn",
        note:
          "Private IP is not currently bound to any active interface on this Mac. Re-run `npm run use:mobile:local`.",
      };
    }
    return {
      tone: "ok",
      note: "Private LAN IP — phone must be on the same Wi-Fi.",
    };
  }
  return { tone: "ok", note: "Public hostname — reachable over the internet." };
}

async function main() {
  console.log("DubGrid mobile environment doctor");
  console.log("");

  if (!existsSync(mobileEnvPath)) {
    console.log(`! apps/mobile/.env.local is missing.`);
    console.log("  Run `npm run use:mobile:local` or `npm run use:mobile:remote` first.");
    process.exit(1);
  }

  const env = parseEnvFile(mobileEnvPath);
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const apiBaseUrl = env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

  console.log(`  EXPO_PUBLIC_SUPABASE_URL    = ${supabaseUrl || "(missing)"}`);
  console.log(`  EXPO_PUBLIC_API_BASE_URL    = ${apiBaseUrl || "(missing)"}`);
  console.log(
    `  EXPO_PUBLIC_SUPABASE_ANON_KEY = ${anonKey ? `${anonKey.slice(0, 8)}…` : "(missing)"}`,
  );
  console.log("");

  if (!supabaseUrl || !apiBaseUrl || !anonKey) {
    console.log("! One or more required env vars are missing. Re-run `use:mobile:local` or `use:mobile:remote`.");
    process.exit(1);
  }

  let apiHost;
  let supabaseHost;
  try {
    apiHost = new URL(apiBaseUrl).hostname;
    supabaseHost = new URL(supabaseUrl).hostname;
  } catch {
    console.log("! One of the URLs is not parseable.");
    process.exit(1);
  }

  const apiClass = classifyHost(apiHost);
  const supabaseClass = classifyHost(supabaseHost);

  console.log(`API host (${apiHost}): ${apiClass.note}`);
  console.log(`Supabase host (${supabaseHost}): ${supabaseClass.note}`);
  console.log("");

  console.log("Probing /api/health on the web server…");
  const apiProbe = await probe(`${apiBaseUrl.replace(/\/$/, "")}/api/health`);
  if (apiProbe.ok) {
    console.log(`  ok (${apiProbe.status}, ${apiProbe.latencyMs}ms)`);
  } else if (apiProbe.status) {
    console.log(`  reached host but got HTTP ${apiProbe.status} (${apiProbe.latencyMs}ms)`);
  } else {
    console.log(`  unreachable: ${apiProbe.error}`);
    console.log("  -> Is the web dev server running? (`npm run dev:web:lan`)");
    console.log("  -> Is your Mac firewall allowing inbound on port 3000?");
  }

  console.log("");
  console.log("Probing /auth/v1/health on Supabase…");
  const supabaseProbe = await probe(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`);
  if (supabaseProbe.ok) {
    console.log(`  ok (${supabaseProbe.status}, ${supabaseProbe.latencyMs}ms)`);
  } else if (supabaseProbe.status) {
    console.log(`  reached host but got HTTP ${supabaseProbe.status} (${supabaseProbe.latencyMs}ms)`);
  } else {
    console.log(`  unreachable: ${supabaseProbe.error}`);
    console.log("  -> Is local Supabase running? (`npx supabase start`)");
  }

  console.log("");
  const anyFail =
    apiClass.tone === "fail" ||
    supabaseClass.tone === "fail" ||
    !apiProbe.ok ||
    !supabaseProbe.ok;
  if (anyFail) {
    console.log("Doctor: issues detected — see notes above.");
    process.exit(1);
  }
  console.log("Doctor: all clear. Sign-in should work from devices on the same Wi-Fi.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[doctor-mobile] ${message}`);
  process.exit(1);
});
