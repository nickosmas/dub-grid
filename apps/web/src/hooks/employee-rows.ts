import type { Employee } from "@/types";

/**
 * Puts a single-employee response in place of its list row. Those responses
 * carry no joined date (only the list fetch reads memberships), so the row
 * keeps the one it had while the account link is unchanged, and the column
 * does not blank until the refetch lands.
 */
export function replaceEmployeeRow(rows: Employee[], next: Employee): Employee[] {
  return rows.map((row) => (row.id === next.id ? withKnownJoinedDate(row, next) : row));
}

function withKnownJoinedDate(previous: Employee, next: Employee): Employee {
  if (next.joinedAt !== undefined) return next;
  const sameAccount = next.userId !== null && next.userId === previous.userId;
  return { ...next, joinedAt: sameAccount ? (previous.joinedAt ?? null) : null };
}
