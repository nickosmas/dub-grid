import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMobilePeopleRows, type MobilePeopleQueryRow } from "./mobile";

function makeRow(n: number): MobilePeopleQueryRow {
  return {
    id: `emp-${n}`,
    employee_number: n,
    first_name: `First${n}`,
    last_name: "Last",
    employment_type: null,
    status: "active",
    status_changed_at: null,
    status_note: null,
    certification_id: null,
    role_ids: null,
    seniority: null,
    focus_area_ids: null,
    department_ids: null,
    dept_admin_ids: null,
    phone: null,
    email: null,
    contact_notes: null,
    user_id: null,
    version: null,
  };
}

/** Fakes the `.from().select().eq().order().range()` chain, returning one page per call. */
function makeServiceClient(pages: Array<{ data: MobilePeopleQueryRow[] | null; error: unknown }>) {
  const range = vi.fn(async () => pages.shift() ?? { data: [], error: null });
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range,
  };
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, range };
}

describe("fetchMobilePeopleRows", () => {
  it("returns all rows after one page when the result is shorter than pageSize", async () => {
    const rows = [makeRow(1), makeRow(2)];
    const { client, range } = makeServiceClient([{ data: rows, error: null }]);

    const result = await fetchMobilePeopleRows(client, "org-1", 5);

    expect(result).toEqual(rows);
    expect(range).toHaveBeenCalledTimes(1);
    expect(range).toHaveBeenCalledWith(0, 4);
  });

  it("pages past PostgREST's row cap instead of silently truncating", async () => {
    const page1 = [makeRow(1), makeRow(2)];
    const page2 = [makeRow(3), makeRow(4)];
    const page3: MobilePeopleQueryRow[] = [];
    const { client, range } = makeServiceClient([
      { data: page1, error: null },
      { data: page2, error: null },
      { data: page3, error: null },
    ]);

    const result = await fetchMobilePeopleRows(client, "org-1", 2);

    expect(result).toEqual([...page1, ...page2]);
    expect(range).toHaveBeenCalledTimes(3);
    expect(range).toHaveBeenNthCalledWith(1, 0, 1);
    expect(range).toHaveBeenNthCalledWith(2, 2, 3);
    expect(range).toHaveBeenNthCalledWith(3, 4, 5);
  });

  it("propagates an error without swallowing it", async () => {
    const { client } = makeServiceClient([{ data: null, error: { message: "boom" } }]);

    await expect(fetchMobilePeopleRows(client, "org-1", 5)).rejects.toEqual({
      message: "boom",
    });
  });
});
