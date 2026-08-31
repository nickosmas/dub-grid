import { describe, expect, it, vi } from "vitest";
import { upsertNamedEntities } from "./shared";

describe("upsertNamedEntities", () => {
  it("updates and counts only collection rows whose persisted snapshot changed", async () => {
    const chain: Record<string, unknown> = {};
    const update = vi.fn(() => chain);
    chain.update = update;
    chain.eq = vi.fn(() => chain);
    const client = { from: vi.fn(() => chain) } as never;
    const existing = [
      { id: 1, name: "Nurse", abbr: "RN" },
      { id: 2, name: "Staff", abbr: "ST" },
    ];
    const items = [
      { id: 1, name: "Nurse", abbr: "RN" },
      { id: 2, name: "Team member", abbr: "ST" },
    ];

    const result = await upsertNamedEntities({
      client,
      table: "certifications",
      orgId: "org-1",
      items,
      existingIds: new Set([1, 2]),
      existingItems: existing,
      shouldUpdate: (before, next) => before.name !== next.name || before.abbr !== next.abbr,
      toRow: (item) => ({ name: item.name, abbr: item.abbr }),
    });

    expect(result).toEqual({ created: 0, updated: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ name: "Team member", abbr: "ST" });
  });
});
