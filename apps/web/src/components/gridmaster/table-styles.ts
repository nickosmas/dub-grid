import type { CSSProperties } from "react";
import { tdStyle, thStyle } from "@/lib/styles";

/**
 * Portal data tables share the surface the way the client app's settings
 * tables do: every column gets an equal track and nothing truncates. Fixed
 * layout is what makes the tracks equal; wrapping is what keeps ids, emails
 * and justifications fully readable instead of clipped or ellipsised.
 */
export const gmTableStyle: CSSProperties = {
  width: "100%",
  tableLayout: "fixed",
  borderCollapse: "collapse",
};

export const gmThStyle: CSSProperties = {
  ...thStyle,
  whiteSpace: "normal",
  verticalAlign: "bottom",
};

export const gmTdStyle: CSSProperties = {
  ...tdStyle,
  overflowWrap: "anywhere",
  verticalAlign: "middle",
};

/**
 * Columns whose content is short (counts, dates, badges, action buttons) get a
 * fixed track so the text-bearing columns (emails, names, justifications)
 * share the rest. This is the portal's version of the settings tables'
 * content-estimated widths, keyed by the header label the tables already use.
 */
const GM_COLUMN_WIDTHS: Record<string, number> = {
  Actions: 100,
  "Active users": 110,
  Activity: 110,
  Billing: 120,
  "Open requests": 120,
  Score: 80,
  Risk: 200,
  "App Users": 96,
  Assignment: 130,
  "Cancel At": 112,
  Created: 172,
  "Date joined": 120,
  Delta: 76,
  Device: 140,
  Duration: 96,
  Email: 250,
  "Employee ID": 110,
  Employees: 100,
  Ended: 172,
  "End reason": 110,
  Expires: 100,
  IP: 120,
  "IP address": 130,
  "Last active": 108,
  "Last login": 108,
  Memberships: 116,
  Mobile: 84,
  "Org users": 96,
  "Organization role": 150,
  Permissions: 130,
  "Period End": 112,
  Phone: 130,
  "Platform role": 120,
  "Retention days": 120,
  Role: 120,
  Seats: 76,
  Sent: 100,
  Sessions: 92,
  "Short code": 100,
  Started: 172,
  Status: 120,
  Stripe: 100,
  Times: 140,
  Timezone: 170,
  "Trial Ends": 112,
  "Trial Started": 112,
  Type: 100,
  Updated: 108,
};

export function gmHeaderStyle(label: string): CSSProperties {
  const width = GM_COLUMN_WIDTHS[label];
  return width ? { ...gmThStyle, width } : gmThStyle;
}
