import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Auth email actions the DubGrid application consumes itself.
 *
 * Supabase can emit other action types, but they are not application-owned
 * navigation capabilities until they are added here with a fixed destination.
 */
export const AUTH_ACTION_DESTINATIONS = {
  recovery: "/reset-password",
} as const satisfies Partial<Record<EmailOtpType, `/${string}`>>;

export type SupportedAuthAction = keyof typeof AUTH_ACTION_DESTINATIONS;

export const POST_LOGIN_DESTINATION = "/dashboard";

const DESTINATION_BASE = "https://app.dubgrid.invalid";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

function decodedSafetyForms(value: string): string[] | null {
  const forms = [value];
  let current = value;

  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) return forms;
      forms.push(decoded);
      current = decoded;
    } catch {
      return null;
    }
  }

  // Excessive nested encoding is not a legitimate navigation need. Reject it
  // instead of guessing how many decoding layers another component may apply.
  return null;
}

function hasUnsafePathForm(value: string): boolean {
  return (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTER.test(value)
  );
}

/**
 * Resolve an untrusted navigation value to an application-owned relative URL.
 * The returned value never contains an origin or credentials.
 */
export function parseInternalDestination(raw: string | null | undefined, fallback: string): string {
  if (!raw || raw.trim() !== raw) return fallback;
  const forms = decodedSafetyForms(raw);
  if (!forms || forms.some(hasUnsafePathForm)) return fallback;

  try {
    const parsed = new URL(raw, DESTINATION_BASE);
    if (parsed.origin !== DESTINATION_BASE || parsed.username || parsed.password) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function isSupportedAuthAction(value: string | null): value is SupportedAuthAction {
  return value !== null && Object.hasOwn(AUTH_ACTION_DESTINATIONS, value);
}

/**
 * Bind an Auth action to its application-owned destination. Invalid destinations
 * fall back to the action's fixed page; unsupported actions are never accepted.
 */
export function resolveAuthActionDestination(
  action: string | null,
  rawDestination: string | null,
): { action: SupportedAuthAction; destination: string } | null {
  if (!isSupportedAuthAction(action)) return null;

  const fallback = AUTH_ACTION_DESTINATIONS[action];
  const destination = parseInternalDestination(rawDestination, fallback);
  const parsed = new URL(destination, DESTINATION_BASE);

  return {
    action,
    destination: parsed.pathname === fallback ? destination : fallback,
  };
}
