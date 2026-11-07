import { useState, useCallback, useMemo } from "react";
import { Employee } from "@/types";

interface UseStaffReorderOptions {
  sorted: Employee[];
  /** Saves the whole new order in one go; false keeps the list open to retry. */
  onSaveOrder: (order: Employee[]) => boolean | Promise<boolean>;
}

export function useStaffReorder({ sorted, onSaveOrder }: UseStaffReorderOptions) {
  const [isReordering, setIsReordering] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Employee[] | null>(null);
  // The list behind the table can change under a search, so a move is measured
  // against the order reordering started from.
  const [startingOrder, setStartingOrder] = useState<Employee[]>([]);

  const isDirty = useMemo(() => {
    if (!isReordering || !pendingOrder) return false;
    return pendingOrder.some((emp, i) => emp.id !== startingOrder[i]?.id);
  }, [isReordering, pendingOrder, startingOrder]);

  const enterReorder = useCallback(() => {
    setIsReordering(true);
    setStartingOrder(sorted);
    setPendingOrder([...sorted]);
  }, [sorted]);

  const saveOrder = useCallback(async () => {
    if (!pendingOrder) return;
    if (!(await onSaveOrder(pendingOrder))) return;
    setIsReordering(false);
    setPendingOrder(null);
  }, [pendingOrder, onSaveOrder]);

  const discardReorder = useCallback(() => {
    setPendingOrder([...startingOrder]);
  }, [startingOrder]);

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
