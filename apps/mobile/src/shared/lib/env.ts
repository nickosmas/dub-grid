import { Platform, type PlatformOSType } from "react-native";

type MobileEnvKey =
  | "EXPO_PUBLIC_SUPABASE_URL"
  | "EXPO_PUBLIC_SUPABASE_ANON_KEY"
  | "EXPO_PUBLIC_API_BASE_URL";

export type MobileEnvConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl: string;
};

export type MobileEnvIssue = {
  key: MobileEnvKey;
  message: string;
};

export type MobileEnvValidation =
  | {
      status: "ready";
      config: MobileEnvConfig;
    }
  | {
      status: "invalid";
      issues: MobileEnvIssue[];
    };

function readEnvValue(key: MobileEnvKey): string {
  return (process.env[key] ?? "").trim();
}

function parseUrlValue(key: MobileEnvKey, value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1"
  );
}

export function isPrivateIpv4Host(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;

  const match = normalized.match(/^172\.(\d+)\./);
  if (!match) return false;

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isKnownHostedSupabaseHost(hostname: string): boolean {
  return hostname.trim().toLowerCase().endsWith(".supabase.co");
}

function isKnownHostedDubGridHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "dubgrid.com" || normalized.endsWith(".dubgrid.com");
}

export function validateMobileEnv(
  platform: PlatformOSType = Platform.OS,
): MobileEnvValidation {
  const supabaseUrl = readEnvValue("EXPO_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = readEnvValue("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  const apiBaseUrl = readEnvValue("EXPO_PUBLIC_API_BASE_URL");

  const issues: MobileEnvIssue[] = [];

  if (!supabaseUrl) {
    issues.push({
      key: "EXPO_PUBLIC_SUPABASE_URL",
      message: "Add your Supabase project URL to apps/mobile/.env.local.",
    });
  }

  if (!supabaseAnonKey) {
    issues.push({
      key: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
      message: "Add the mobile anon key to apps/mobile/.env.local.",
    });
  }

  if (!apiBaseUrl) {
    issues.push({
      key: "EXPO_PUBLIC_API_BASE_URL",
      message: "Add the reachable web API base URL to apps/mobile/.env.local.",
    });
  }

  const supabaseUrlObject = supabaseUrl
    ? parseUrlValue("EXPO_PUBLIC_SUPABASE_URL", supabaseUrl)
    : null;
  const apiBaseUrlObject = apiBaseUrl
    ? parseUrlValue("EXPO_PUBLIC_API_BASE_URL", apiBaseUrl)
    : null;

  if (supabaseUrl && !supabaseUrlObject) {
    issues.push({
      key: "EXPO_PUBLIC_SUPABASE_URL",
      message: "Use a full Supabase URL, including http:// or https://.",
    });
  }

  if (apiBaseUrl && !apiBaseUrlObject) {
    issues.push({
      key: "EXPO_PUBLIC_API_BASE_URL",
      message: "Use a full API URL, including http:// or https://.",
    });
  }

  if (platform !== "web" && supabaseUrlObject && isLoopbackHost(supabaseUrlObject.hostname)) {
    issues.push({
      key: "EXPO_PUBLIC_SUPABASE_URL",
      message:
        "127.0.0.1 and localhost point back to the phone, not your laptop. Use the hosted backend, a tunnel, or a reachable LAN IP instead.",
    });
  }

  if (platform !== "web" && apiBaseUrlObject && isLoopbackHost(apiBaseUrlObject.hostname)) {
    issues.push({
      key: "EXPO_PUBLIC_API_BASE_URL",
      message:
        "127.0.0.1 and localhost are not reachable from Expo Go on a real phone. Point the mobile API URL at a public host, tunnel, or LAN IP.",
    });
  }

  if (supabaseUrlObject && apiBaseUrlObject) {
    const supabaseHost = supabaseUrlObject.hostname;
    const apiHost = apiBaseUrlObject.hostname;
    const supabaseLooksLocal =
      isLoopbackHost(supabaseHost) || isPrivateIpv4Host(supabaseHost);
    const apiLooksLocal =
      isLoopbackHost(apiHost) || isPrivateIpv4Host(apiHost);

    if (supabaseLooksLocal && isKnownHostedDubGridHost(apiHost)) {
      issues.push({
        key: "EXPO_PUBLIC_API_BASE_URL",
        message:
          "Your mobile API URL points at the hosted DubGrid backend while Supabase points at a local machine. Use `npm run use:mobile:local` for local testing or `npm run use:mobile:remote` for the hosted backend.",
      });
    }

    if (apiLooksLocal && isKnownHostedSupabaseHost(supabaseHost)) {
      issues.push({
        key: "EXPO_PUBLIC_SUPABASE_URL",
        message:
          "Your mobile Supabase URL points at the hosted project while the API points at a local machine. Use `npm run use:mobile:local` for local testing or `npm run use:mobile:remote` for the hosted backend.",
      });
    }
  }

  if (issues.length > 0) {
    return {
      status: "invalid",
      issues,
    };
  }

  return {
    status: "ready",
    config: {
      supabaseUrl,
      supabaseAnonKey,
      apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
    },
  };
}

export function getMobileEnvConfig(
  platform: PlatformOSType = Platform.OS,
): MobileEnvConfig {
  const validation = validateMobileEnv(platform);
  if (validation.status !== "ready") {
    const message = validation.issues.map((issue) => issue.message).join(" ");
    throw new Error(message);
  }

  return validation.config;
}
