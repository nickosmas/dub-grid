const REDACTED = "[REDACTED]";
const SECRET_KEY =
  /(?:authorization|cookie|password|secret|token|token_hash|access_token|refresh_token|otp|code)/i;
const SECRET_QUERY =
  /([?&](?:token|token_hash|access_token|refresh_token|password|secret|code)=)[^&#\s]*/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export function redactSecurityText(value: string): string {
  return value
    .replace(SECRET_QUERY, `$1${REDACTED}`)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(JWT, REDACTED);
}

export function redactSecurityValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactSecurityText(value);
  if (value instanceof Error) {
    const sanitized = new Error(redactSecurityText(value.message));
    sanitized.name = value.name;
    if (value.stack) sanitized.stack = redactSecurityText(value.stack);
    return sanitized;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactSecurityValue(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? REDACTED : redactSecurityValue(item, seen),
    ]),
  );
}

export function redactSecurityError(error: unknown): unknown {
  return redactSecurityValue(error);
}
