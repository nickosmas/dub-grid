import tzlookup from "tz-lookup";

/**
 * Resolves an IANA timezone from coordinates using a bundled offline dataset.
 * Returns null for missing or out-of-range input (tz-lookup throws on bad input).
 */
export function getTimezoneForCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  try {
    return tzlookup(latitude, longitude);
  } catch {
    return null;
  }
}
