import { useState, useCallback, useMemo } from "react";
import { Employee } from "@/types";

interface UseStaffReorderOptions {
  sorted: Employee[];
  onSave: (emp: Employee) => unknown;
}

export function useStaffReorder({ sorted, onSave }: UseStaffReorderOptions) {
  const [isReordering, setIsReordering] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Employee[] | null>(null);

  const isDirty = useMemo(() => {
    if (!isReordering || !pendingOrder) return false;
    return pendingOrder.some((emp, i) => emp.id !== sorted[i]?.id);
  }, [isReordering, pendingOrder, sorted]);

  const enterReorder = useCallback(() => {
    setIsReordering(true);
    setPendingOrder([...sorted]);
  }, [sorted]);

  const saveOrder = useCallback(async () => {
    if (!pendingOrder) return;
    await Promise.all(
      pendingOrder.flatMap((emp, i) =>
        emp.seniority === i + 1 ? [] : [onSave({ ...emp, seniority: i + 1 })],
      ),
    );
    setIsReordering(false);
    setPendingOrder(null);
  }, [pendingOrder, onSave]);

  const discardReorder = useCallback(() => {
    setPendingOrder([...sorted]);
  }, [sorted]);

  const cancelReorder = useCallback(() => {
    setIsReordering(false);
    setPendingOrder(null);
  }, []);

  const moveEmployee = useCallback((sourceIdx: number, dropIdx: number) => {
    if (sourceIdx === dropIdx) return;
    setPendingOrder((current) => {
      if (!current || sourceIdx < 0 || sourceIdx >= current.length) return current;
      const list = [...current];
      const [item] = list.splice(sourceIdx, 1);
      if (!item) return current;
      list.splice(Math.max(0, Math.min(dropIdx, list.length)), 0, item);
      return list;
    });
  }, []);

  const displayList = isReordering && pendingOrder !== null ? pendingOrder : sorted;

  return {
    isReordering,
    pendingOrder,
    isDirty,
    enterReorder,
    saveOrder,
    discardReorder,
    cancelReorder,
    moveEmployee,
    displayList,
  };
}
