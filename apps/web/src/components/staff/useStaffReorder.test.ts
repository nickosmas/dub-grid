import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Employee } from "@/types";
import { useStaffReorder } from "./useStaffReorder";

const people = [
  { id: "a", seniority: 1 },
  { id: "b", seniority: 2 },
  { id: "c", seniority: 3 },
] as Employee[];

describe("useStaffReorder", () => {
  it("stays in reorder mode until every moved row has saved", async () => {
    const pending: Array<() => void> = [];
    const onSave = vi.fn(() => new Promise<void>((resolve) => pending.push(resolve)));
    const { result } = renderHook(() => useStaffReorder({ sorted: people, onSave }));

    act(() => result.current.enterReorder());
    act(() => result.current.moveEmployee(0, 1));

    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = result.current.saveOrder();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "b", seniority: 1 }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "a", seniority: 2 }));
    expect(result.current.isReordering).toBe(true);

    await act(async () => {
      pending.forEach((resolve) => resolve());
      await saving;
    });
    expect(result.current.isReordering).toBe(false);
  });

  it("discards a moved order in place, staying in reorder mode", () => {
    const { result } = renderHook(() => useStaffReorder({ sorted: people, onSave: vi.fn() }));

    act(() => result.current.enterReorder());
    act(() => result.current.moveEmployee(0, 2));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.discardReorder());

    expect(result.current.isDirty).toBe(false);
    expect(result.current.isReordering).toBe(true);
    expect(result.current.displayList.map((employee) => employee.id)).toEqual(["a", "b", "c"]);
  });
});
