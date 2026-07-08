export interface TimezoneOption {
  value: string;
  label: string;
  triggerLabel: string;
  searchText: string;
}

const FALLBACK_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Halifax",
  "America/St_Johns",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Athens",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function getSupportedTimezones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const values = Intl.supportedValuesOf("timeZone");
      if (values.length > 0) return values;
    }
  } catch {
    // Fall through to the curated fallback list.
  }

  return FALLBACK_TIMEZONES;
}

export function getBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function formatTimezoneOffset(timeZone: string, date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    });
    const value = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value;

    if (!value) return "UTC";
    if (value === "GMT") return "UTC";
    return value.replace("GMT", "UTC");
  } catch {
    return "UTC";
  }
}

export function humanizeTimezone(timeZone: string): string {
  if (!timeZone.includes("/")) return timeZone.replace(/_/g, " ");

  const segments = timeZone.split("/").map((segment) => segment.replace(/_/g, " "));
  const region = segments[0];
  const locality = segments.slice(1).join(" / ");
  return locality ? `${locality} (${region})` : region;
}

export function formatTimezoneLabel(timeZone: string, date = new Date()): string {
  return `${formatTimezoneOffset(timeZone, date)} • ${humanizeTimezone(timeZone)}`;
}

export function buildTimezoneOptions({
  selectedTimeZone,
  detectedTimeZone,
  date = new Date(),
}: {
  selectedTimeZone?: string | null;
  detectedTimeZone?: string | null;
  date?: Date;
} = {}): TimezoneOption[] {
  const orderedTimezones = unique([selectedTimeZone, detectedTimeZone, ...getSupportedTimezones()]);

  return orderedTimezones.map((timeZone) => {
    const tags: string[] = [];
    if (timeZone === selectedTimeZone) tags.push("Saved");
    if (timeZone === detectedTimeZone) tags.push("Local");

    const baseLabel = formatTimezoneLabel(timeZone, date);
    const suffix = tags.length > 0 ? ` — ${tags.join(" · ")}` : "";

    return {
      value: timeZone,
      label: `${baseLabel}${suffix}`,
      triggerLabel: baseLabel,
      searchText: [
        timeZone,
        humanizeTimezone(timeZone),
        formatTimezoneOffset(timeZone, date),
        ...tags,
      ]
        .join(" ")
        .toLowerCase(),
    };
  });
}
