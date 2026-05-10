import { describe, expect, it, vi } from "vitest";
import { discardScheduleDraftsDirect } from "./schedule-draft-safety";

function resolvedQuery<T>(result: T) {
  return {
    then: (
      resolve: (value: T) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
}

describe("discardScheduleDraftsDirect", () => {
  it("batches new draft cell deletes to keep PostgREST filters bounded", async () => {
    const deletedCellBatches: string[][] = [];
    const draftCells = Array.from({ length: 120 }, (_, index) => ({
      id: `cell-${index}`,
      version: 0,
      snapshots: [{ id: `snapshot-${index}`, snapshot_kind: "draft" }],
    }));

    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "schedule_cells") {
          const selectQuery = {
            eq: vi.fn(() => selectQuery),
            then: resolvedQuery({ data: draftCells, error: null }).then,
          };
          return {
            select: vi.fn(() => selectQuery),
            delete: vi.fn(() => ({
              in: vi.fn((_column: string, ids: string[]) => {
                deletedCellBatches.push(ids);
                return resolvedQuery({ error: null });
              }),
            })),
          };
        }

        if (table === "schedule_notes") {
          const query = {
            eq: vi.fn(() => query),
            then: resolvedQuery({ error: null }).then,
          };
          return {
            delete: vi.fn(() => query),
            update: vi.fn(() => query),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    await discardScheduleDraftsDirect({
      orgId: "11111111-1111-4111-8111-111111111111",
      serviceClient: serviceClient as never,
    });

    expect(deletedCellBatches.map((batch) => batch.length)).toEqual([
      50,
      50,
      20,
    ]);
  });

  it("batches modified draft snapshot deletes to keep PostgREST filters bounded", async () => {
    const deletedSnapshotBatches: string[][] = [];
    const touchedCells: string[] = [];
    const draftCells = Array.from({ length: 105 }, (_, index) => ({
      id: `cell-${index}`,
      version: 0,
      snapshots: [
        { id: `published-snapshot-${index}`, snapshot_kind: "published" },
        { id: `draft-snapshot-${index}`, snapshot_kind: "draft" },
      ],
    }));

    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "schedule_cells") {
          const selectQuery = {
            eq: vi.fn(() => selectQuery),
            then: resolvedQuery({ data: draftCells, error: null }).then,
          };
          const updateQuery = {
            eq: vi.fn((column: string, value: string | number) => {
              if (column === "id" && typeof value === "string") {
                touchedCells.push(value);
              }
              return updateQuery;
            }),
            then: resolvedQuery({ error: null }).then,
          };
          return {
            select: vi.fn(() => selectQuery),
            update: vi.fn(() => updateQuery),
          };
        }

        if (table === "schedule_cell_snapshots") {
          return {
            delete: vi.fn(() => ({
              in: vi.fn((_column: string, ids: string[]) => {
                deletedSnapshotBatches.push(ids);
                return resolvedQuery({ error: null });
              }),
            })),
          };
        }

        if (table === "schedule_notes") {
          const query = {
            eq: vi.fn(() => query),
            then: resolvedQuery({ error: null }).then,
          };
          return {
            delete: vi.fn(() => query),
            update: vi.fn(() => query),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    await discardScheduleDraftsDirect({
      orgId: "11111111-1111-4111-8111-111111111111",
      serviceClient: serviceClient as never,
    });

    expect(deletedSnapshotBatches.map((batch) => batch.length)).toEqual([
      50,
      50,
      5,
    ]);
    expect(touchedCells).toHaveLength(105);
  });
});
