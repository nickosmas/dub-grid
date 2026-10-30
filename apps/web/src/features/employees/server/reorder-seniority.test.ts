import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reorderSeniority } from "./reorder-seniority";

vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/lib/db/mappers", () => ({
  rowToEmployee: (row: Row) => ({ id: row.id, seniority: row.seniority, version: row.version }),
}));

interface Row {
  id: string;
  org_id: string;
  seniority: number;
  version: number;
}

/** Enough of the Supabase query builder for the reads and writes reorder makes. */
function fakeClient(rows: Row[], options: { bumpBeforeWrite?: string } = {}) {
  const writes: Array<{ id: string; seniority: number }> = [];
  const client = {
    from: () => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const read = {
          eq: (column: string, value: unknown) => ((filters[column] = value), read),
          in: async (_column: string, ids: string[]) => ({
            data: rows.filter((row) => row.org_id === filters.org_id && ids.includes(row.id)),
            error: null,
          }),
        };
        return read;
      },
      update: (patch: { seniority: number; version: number }) => {
        const filters: Record<string, unknown> = {};
        const write = {
          eq: (column: string, value: unknown) => ((filters[column] = value), write),
          select: () => ({
            maybeSingle: async () => {
              const row = rows.find(
                (candidate) => candidate.id === filters.id && candidate.org_id === filters.org_id,
              );
              if (row && options.bumpBeforeWrite === row.id) row.version += 1;
              if (!row || row.version !== filters.version) return { data: null, error: null };
              row.seniority = patch.seniority;
              row.version = patch.version;
              writes.push({ id: row.id, seniority: patch.seniority });
              return { data: { ...row }, error: null };
            },
          }),
        };
        return write;
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, writes };
}

function roster(): Row[] {
  return ["a", "b", "c", "d"].map((id, index) => ({
    id,
    org_id: "org-1",
    seniority: index + 1,
    version: 3,
  }));
}

describe("reorderSeniority", () => {
  it("writes only the people whose place changed", async () => {
    const rows = roster();
    const { client, writes } = fakeClient(rows);

    const result = await reorderSeniority(client, "org-1", [
      { id: "b", seniority: 1, version: 3 },
      { id: "a", seniority: 2, version: 3 },
      { id: "c", seniority: 3, version: 3 },
    ]);

    expect(result.kind).toBe("saved");
    expect(writes).toEqual([
      { id: "b", seniority: 1 },
      { id: "a", seniority: 2 },
    ]);
    expect(rows.map((row) => [row.id, row.seniority, row.version])).toEqual([
      ["a", 2, 4],
      ["b", 1, 4],
      ["c", 3, 3],
      ["d", 4, 3],
    ]);
  });

  it("refuses the whole order before writing when anyone's version is stale", async () => {
    const { client, writes } = fakeClient(roster());

    const result = await reorderSeniority(client, "org-1", [
      { id: "b", seniority: 1, version: 3 },
      { id: "a", seniority: 2, version: 2 },
    ]);

    expect(result).toEqual({ kind: "conflict" });
    expect(writes).toEqual([]);
  });

  it("puts back what it wrote when someone saves one of them in between", async () => {
    const rows = roster();
    const { client } = fakeClient(rows, { bumpBeforeWrite: "c" });

    const result = await reorderSeniority(
      client,
      "org-1",
      [
        { id: "d", seniority: 1, version: 3 },
        { id: "a", seniority: 2, version: 3 },
        { id: "b", seniority: 3, version: 3 },
        { id: "c", seniority: 4, version: 3 },
      ],
      2,
    );

    expect(result).toEqual({ kind: "conflict" });
    expect(rows.map((row) => [row.id, row.seniority])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ]);
  });

  it("refuses ids it can't find in the organization, or the same person twice", async () => {
    const { client } = fakeClient(roster());

    expect(
      await reorderSeniority(client, "org-1", [{ id: "z", seniority: 1, version: 3 }]),
    ).toEqual({ kind: "missing" });
    expect(
      await reorderSeniority(client, "org-1", [
        { id: "a", seniority: 2, version: 3 },
        { id: "a", seniority: 1, version: 3 },
      ]),
    ).toEqual({ kind: "missing" });
  });
});
