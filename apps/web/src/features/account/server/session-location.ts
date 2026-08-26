import "server-only";

export interface SessionLocation {
  city: string | null;
  country: string | null;
}

/**
 * Reads location data injected by the hosting provider. These values are
 * advisory only: the request's IP remains the primary connection detail, and
 * local/self-hosted requests simply have no location attached.
 */
export function getSessionLocation(headers: Headers): SessionLocation {
  const city = decodeHeaderValue(headers.get("x-vercel-ip-city"));
  const country = formatCountry(headers.get("x-vercel-ip-country"));

  return { city, country };
}

function decodeHeaderValue(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return decodeURIComponent(trimmed).trim() || null;
  } catch {
    return trimmed;
  }
}

function formatCountry(value: string | null): string | null {
  const country = decodeHeaderValue(value);
  if (!country) return null;

  if (!/^[a-z]{2}$/i.test(country)) return country;

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country.toUpperCase()) ?? country;
  } catch {
    return country.toUpperCase();
  }
}
