import type { Employee } from "@/types";
import { withKnownJoinedDate } from "@/lib/staff-directory";

/**
 * Puts a single-employee response in place of its list row. Save and status
 * responses carry no joined date (only reads attach memberships), so the row
 * keeps the one it had while the account link is unchanged, and the column
 * does not blank until the refetch lands.
 */
export function replaceEmployeeRow(rows: Employee[], next: Employee): Employee[] {
  return rows.map((row) => (row.id === next.id ? withKnownJoinedDate(row, next) : row));
}
