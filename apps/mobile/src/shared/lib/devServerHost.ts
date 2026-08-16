import Constants from "expo-constants";
import { NativeModules } from "react-native";

/**
 * The dev machine's LAN address drifts constantly — DHCP hands out a new lease,
 * or the laptop moves between Wi-Fi and a phone hotspot — while `EXPO_PUBLIC_*`
 * values are inlined into the bundle at transform time. A baked-in IP therefore
 * goes stale mid-session and every request fails as a bare "Network request
 * failed", with nothing wrong in the app itself.
 *
 * The device already knows a working address for that machine: the one it just
 * downloaded this bundle from. Reading it back at runtime keeps the API and
 * Supabase hosts pinned to wherever Metro actually is, so the address in
 * `.env.local` stops mattering during local development.
 */

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpv4Address(value: string): boolean {
  const match = value.trim().match(IPV4_PATTERN);
  if (!match) return false;

  return match.slice(1).every((octet) => Number(octet) <= 255);
}

/**
 * Pull the host out of either shape the dev server is reported in: `hostUri`
 * arrives bare (`192.168.1.5:8081`), `scriptURL` as a full bundle URL.
 */
export function parseDevServerHost(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;

  const trimmed = candidate.trim();
  if (!trimmed) return null;

  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const [authority] = withoutScheme.split("/");
  const host = authority?.split(":")[0]?.trim();

  return host || null;
}

function readScriptUrl(): string | null {
  try {
    const sourceCode = NativeModules?.SourceCode as
      { scriptURL?: string; getConstants?: () => { scriptURL?: string } } | undefined;

    return sourceCode?.getConstants?.().scriptURL ?? sourceCode?.scriptURL ?? null;
  } catch {
    // The module is absent outside a native runtime (tests, web).
    return null;
  }
}

/**
 * The address the bundle was served from, or `null` when it is unusable as a
 * substitute host. Only an IPv4 literal qualifies: a tunnel serves the bundle
 * from `*.exp.direct`, which proxies Metro's port alone, so pointing :3000 and
 * :54321 at it would break a setup that currently works.
 */
export function getDevServerHost(): string | null {
  // `__DEV__` is a Metro/RN global that isn't defined outside the app runtime.
  if (typeof __DEV__ === "undefined" || !__DEV__) return null;

  const candidates: Array<() => unknown> = [
    () => Constants.expoConfig?.hostUri,
    () => readScriptUrl(),
  ];

  for (const read of candidates) {
    const host = parseDevServerHost(read());
    if (host && isIpv4Address(host)) return host;
  }

  return null;
}
