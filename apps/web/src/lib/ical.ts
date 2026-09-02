/**
 * ICS (iCalendar) generation — no library needed, simple text format.
 */

interface ICalDateValue {
  date: string;
  time?: string;
}

interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: ICalDateValue;
  dtend: ICalDateValue;
  timeZone?: string;
  description?: string;
  location?: string;
}

function formatTimestamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function formatDateValue(value: ICalDateValue): string {
  const date = value.date.replaceAll("-", "");
  if (!value.time) return date;
  return `${date}T${value.time.replaceAll(":", "").padEnd(6, "0")}`;
}

function getDateLines(event: ICalEvent): [string, string] {
  const isTimed = Boolean(event.dtstart.time && event.dtend.time);
  if (!isTimed) {
    return [
      `DTSTART;VALUE=DATE:${formatDateValue(event.dtstart)}`,
      `DTEND;VALUE=DATE:${formatDateValue(event.dtend)}`,
    ];
  }

  const timeZone = event.timeZone?.replace(/[^A-Za-z0-9_+\-/]/g, "") || "UTC";
  return [
    `DTSTART;TZID=${timeZone}:${formatDateValue(event.dtstart)}`,
    `DTEND;TZID=${timeZone}:${formatDateValue(event.dtend)}`,
  ];
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Generate an ICS calendar string from a list of events.
 */
export function generateICS(
  events: ICalEvent[],
  calendarName = "DubGrid Schedule",
  timeZone?: string,
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DubGrid//Schedule//EN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (timeZone) {
    lines.push(`X-WR-TIMEZONE:${escapeText(timeZone)}`);
  }

  for (const event of events) {
    const [startLine, endLine] = getDateLines(event);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      startLine,
      endLine,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    lines.push(`DTSTAMP:${formatTimestamp(new Date())}`, "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
