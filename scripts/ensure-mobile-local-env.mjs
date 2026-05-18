import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import {
  getCandidateIpv4Addresses,
  isLoopbackHost,
  isPhoneUnreachableIpv4Address,
  isPrivateIpv4Address,
} from "./use-mobile-local.mjs";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const mobileEnvPath = resolve(repoRoot, "apps/mobile/.env.local");

function parseEnvFile(path) {
  const values = {};
  const content = readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
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

function isHostedDubGridHost(hostname) {
  const h = hostname.toLowerCase();
  return h === "dubgrid.com" || h.endsWith(".dubgrid.com");
}

function isHostedSupabaseHost(hostname) {
  return hostname.toLowerCase().endsWith(".supabase.co");
}

function regenerate(reason) {
  console.log(`[ensure-mobile-local-env] ${reason} Re-running use:mobile:local…`);
  const result = spawnSync(
    process.execPath,
    [resolve(repoRoot, "scripts/use-mobile-local.mjs")],
    { stdio: "inherit", cwd: repoRoot },
  );

  if (result.status !== 0) {
    console.warn(
      "[ensure-mobile-local-env] Could not refresh apps/mobile/.env.local automatically. Run `npm run use:mobile:local` (or `npm run use:mobile:remote`) manually before signing in from a device.",
    );
  }
}

function main() {
  if (!existsSync(mobileEnvPath)) {
    regenerate("apps/mobile/.env.local is missing.");
    return;
  }

  const env = parseEnvFile(mobileEnvPath);
  const apiBaseUrl = env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    regenerate("EXPO_PUBLIC_API_BASE_URL is empty.");
    return;
  }

  let host;
  try {
    host = new URL(apiBaseUrl).hostname;
  } catch {
    regenerate(`EXPO_PUBLIC_API_BASE_URL is not a valid URL (${apiBaseUrl}).`);
    return;
  }

  // Hosted backend — user explicitly chose remote; leave alone.
  if (isHostedDubGridHost(host) || isHostedSupabaseHost(host)) {
    return;
  }

  // Loopback was caught at app boot already, but regen anyway so the dev
  // doesn't have to remember the right script.
  if (isLoopbackHost(host)) {
    regenerate(`${host} is a loopback host — unreachable from a phone.`);
    return;
  }

  if (isPhoneUnreachableIpv4Address(host)) {
    regenerate(`${host} is not phone-reachable (likely VPN or iCloud Private Relay).`);
    return;
  }

  // Only regen private IPs that are no longer bound to any active interface.
  if (isPrivateIpv4Address(host)) {
    const active = new Set(getCandidateIpv4Addresses().map((c) => c.address));
    if (!active.has(host)) {
      regenerate(`${host} is no longer bound to any active interface on this machine.`);
    }
    return;
  }

  // Any other host (custom DNS, tunneled hostname, etc.) — trust the dev.
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[ensure-mobile-local-env] ${message}`);
}
