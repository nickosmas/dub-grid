/**
 * ICS (iCalendar) generation — no library needed, simple text format.
 */

interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string;
  location?: string;
}

function formatDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Generate an ICS calendar string from a list of events.
 */
export function generateICS(events: ICalEvent[], calendarName = "DubGrid Schedule"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DubGrid//Schedule//EN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTART:${formatDate(event.dtstart)}`,
      `DTEND:${formatDate(event.dtend)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    lines.push(`DTSTAMP:${formatDate(new Date())}`, "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
