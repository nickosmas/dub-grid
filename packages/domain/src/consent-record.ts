/** What the server last recorded for this device's cookie consent choice. */
export interface ConsentRecordMark {
  version: string;
  analytics: boolean;
  /** The user the server attributed the record to, or null when anonymous. */
  userId: string | null;
}

export interface CurrentConsentChoice {
  version: string;
  analytics: boolean;
  userId: string | null;
}

/**
 * Whether the device's current choice still needs a server record. A choice
 * made signed out is recorded again once someone signs in, so the record names
 * them; signing out afterwards needs nothing new, since the choice is already
 * on record.
 */
export function needsConsentRecord(
  recorded: ConsentRecordMark | null,
  current: CurrentConsentChoice,
): boolean {
  if (!recorded) return true;
  if (recorded.version !== current.version || recorded.analytics !== current.analytics) {
    return true;
  }
  return current.userId !== null && recorded.userId !== current.userId;
}

/** Read a stored mark, or null when it is missing or malformed. */
export function parseConsentRecordMark(raw: string | null | undefined): ConsentRecordMark | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { version, analytics, userId } = value as Record<string, unknown>;
    if (typeof version !== "string" || typeof analytics !== "boolean") return null;
    if (userId !== null && typeof userId !== "string") return null;
    return { version, analytics, userId };
  } catch {
    return null;
  }
}
