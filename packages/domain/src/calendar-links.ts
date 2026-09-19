export type CalendarSubscribeTarget = "apple" | "google" | "outlook";

export const CALENDAR_SUBSCRIBE_TARGETS: readonly CalendarSubscribeTarget[] = [
  "apple",
  "google",
  "outlook",
];

export const CALENDAR_SUBSCRIBE_LABELS: Record<CalendarSubscribeTarget, string> = {
  apple: "Apple Calendar",
  google: "Google Calendar",
  outlook: "Outlook",
};

export interface CalendarSubscribeLinks {
  apple: string;
  google: string;
  outlook: string;
}

const CALENDAR_SUBSCRIBE_NAME = "DubGrid";

function parseAbsoluteHttpUrl(feedUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(feedUrl);
  } catch {
    throw new Error("Calendar feed URL must be absolute");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Calendar feed URL must use http or https");
  }
  return parsed;
}

export function buildCalendarSubscribeLinks(feedUrl: string): CalendarSubscribeLinks {
  const parsed = parseAbsoluteHttpUrl(feedUrl);
  const href = parsed.toString();
  const encoded = encodeURIComponent(href);
  // Apple only opens the Subscribe sheet for webcal(s); a plain http feed
  // (local dev) has to fall back to webcal or Calendar refuses the URL.
  const appleScheme = parsed.protocol === "https:" ? "webcals:" : "webcal:";
  return {
    apple: appleScheme + href.slice(parsed.protocol.length),
    google: `https://calendar.google.com/calendar/r?cid=${encoded}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encoded}&name=${CALENDAR_SUBSCRIBE_NAME}`,
  };
}
