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
  it("saves the whole new order in one call and leaves reorder mode once it's saved", async () => {
    let finish: (saved: boolean) => void = () => {};
    const onSaveOrder = vi.fn(
      (_order: Employee[]) => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    const { result } = renderHook(() => useStaffReorder({ sorted: people, onSaveOrder }));

    act(() => result.current.enterReorder());
    act(() => result.current.moveEmployee(0, 1));

    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = result.current.saveOrder();
    });
    expect(onSaveOrder).toHaveBeenCalledTimes(1);
    expect(onSaveOrder.mock.calls[0][0].map((employee: Employee) => employee.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(result.current.isReordering).toBe(true);

    await act(async () => {
      finish(true);
      await saving;
    });
    expect(result.current.isReordering).toBe(false);
  });

  it("stays in reorder mode with the new order when the save fails", async () => {
    const onSaveOrder = vi.fn(async (_order: Employee[]) => false);
    const { result } = renderHook(() => useStaffReorder({ sorted: people, onSaveOrder }));

    act(() => result.current.enterReorder());
    act(() => result.current.moveEmployee(0, 2));
    await act(async () => {
      await result.current.saveOrder();
    });

    expect(result.current.isReordering).toBe(true);
    expect(result.current.displayList.map((employee) => employee.id)).toEqual(["b", "c", "a"]);
  });

  it("discards a moved order in place, staying in reorder mode", () => {
    const { result } = renderHook(() => useStaffReorder({ sorted: people, onSaveOrder: vi.fn() }));

    act(() => result.current.enterReorder());
    act(() => result.current.moveEmployee(0, 2));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.discardReorder());

    expect(result.current.isDirty).toBe(false);
    expect(result.current.isReordering).toBe(true);
    expect(result.current.displayList.map((employee) => employee.id)).toEqual(["a", "b", "c"]);
  });
});
