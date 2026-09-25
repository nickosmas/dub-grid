import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hasStartedSelfDeletion, SELF_DELETION_RESUME_WINDOW_MS } from "./self-deletion";

function clientFinding(rows: unknown[]) {
  const filters: Array<[string, string, unknown]> = [];
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => (filters.push(["eq", column, value]), chain),
    gte: (column: string, value: unknown) => (filters.push(["gte", column, value]), chain),
    limit: async () => ({ data: rows, error: null }),
  };
  return { client: { from: () => chain } as never, filters };
}

describe("hasStartedSelfDeletion", () => {
  // An old record used to let a user skip the permission check indefinitely,
  // even after joining an organization that requires approved deletion.
  it("counts only a record started within the resume window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00.000Z"));
    const { client, filters } = clientFinding([{ id: 1 }]);

    await expect(hasStartedSelfDeletion(client, "user-1", "account")).resolves.toBe(true);

    expect(filters).toContainEqual(["eq", "action", "account.deletion_started"]);
    expect(filters).toContainEqual([
      "gte",
      "created_at",
      new Date(
        Date.parse("2026-09-25T12:00:00.000Z") - SELF_DELETION_RESUME_WINDOW_MS,
      ).toISOString(),
    ]);
    vi.useRealTimers();
  });

  it("finds no resumable deletion when there is no recent record", async () => {
    const { client } = clientFinding([]);

    await expect(hasStartedSelfDeletion(client, "user-1", "gdpr")).resolves.toBe(false);
  });
});
