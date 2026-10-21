import { describe, expect, it } from "vitest";
import { enrichAuditRows } from "./enrich";

function fakeClient(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? [], error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        in: () => builder,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  } as never;
}

describe("enrichAuditRows", () => {
  it("names the person whose day a schedule edit changed (46h)", async () => {
    const [entry] = await enrichAuditRows(
      fakeClient({
        employees: [{ id: "emp-1", first_name: "Laura", last_name: "Marshall", email: null }],
      }),
      [
        {
          id: 1,
          org_id: null,
          actor_id: null,
          action: "shift.updated",
          resource_type: "shift",
          resource_id: "emp-1:2026-10-22",
          details: {},
          created_at: "2026-10-21T12:00:00.000Z",
        },
      ],
    );

    expect(entry?.targetLabel).toBe("Laura Marshall");
  });
});
