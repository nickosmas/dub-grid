import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMobileScheduleNoteRows = vi.fn();

vi.mock("@dubgrid/data-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dubgrid/data-access")>()),
  fetchMobileScheduleNoteRows: (...args: unknown[]) => fetchMobileScheduleNoteRows(...args),
}));

import { fetchMobileScheduleNotes } from "./data";

// 42b: the notes the schedule loaders receive, before the viewer's rule.
describe("fetchMobileScheduleNotes", () => {
  beforeEach(() => fetchMobileScheduleNoteRows.mockReset());

  it("maps each note with its indicator's own name and colour", async () => {
    fetchMobileScheduleNoteRows.mockResolvedValue([
      {
        emp_id: "emp-1",
        date: "2026-09-21",
        indicator_type_id: 7,
        focus_area_id: 2,
        status: "draft",
        indicator_types: { name: "Float", color: "#ff0000" },
      },
    ]);
    const input = { orgId: "org-1", startDate: "2026-09-20", endDate: "2026-09-26" };

    await expect(fetchMobileScheduleNotes({} as never, input)).resolves.toEqual([
      {
        employeeId: "emp-1",
        date: "2026-09-21",
        indicatorTypeId: 7,
        focusAreaId: 2,
        status: "draft",
        name: "Float",
        color: "#ff0000",
      },
    ]);
    expect(fetchMobileScheduleNoteRows).toHaveBeenCalledWith({}, input);
  });

  it("falls back to a readable name and colour when the type is missing", async () => {
    fetchMobileScheduleNoteRows.mockResolvedValue([
      {
        emp_id: "emp-1",
        date: "2026-09-21",
        indicator_type_id: 7,
        focus_area_id: null,
        status: "published",
        indicator_types: null,
      },
    ]);

    const [note] = await fetchMobileScheduleNotes({} as never, {
      orgId: "org-1",
      startDate: "2026-09-20",
      endDate: "2026-09-26",
    });
    expect(note).toMatchObject({ name: "Note", color: "#94A3B8", focusAreaId: null });
  });
});
