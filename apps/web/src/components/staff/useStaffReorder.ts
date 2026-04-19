import { useState, useCallback, useMemo } from "react";
import { Employee } from "@/types";

interface UseStaffReorderOptions {
  sorted: Employee[];
  onSave: (emp: Employee) => void;
}

export function useStaffReorder({ sorted, onSave }: UseStaffReorderOptions) {
  const [isReordering, setIsReordering] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Employee[] | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const isDirty = useMemo(() => {
    if (!isReordering || !pendingOrder) return false;
    return pendingOrder.some((emp, i) => emp.id !== sorted[i]?.id);
  }, [isReordering, pendingOrder, sorted]);

  const enterReorder = useCallback(() => {
    setIsReordering(true);
    setPendingOrder([...sorted]);
  }, [sorted]);

  const saveOrder = useCallback(() => {
    if (!pendingOrder) return;
    pendingOrder.forEach((emp, i) => {
      if (emp.seniority !== i + 1) {
        onSave({ ...emp, seniority: i + 1 });
      }
    });
    setIsReordering(false);
    setPendingOrder(null);
  }, [pendingOrder, onSave]);

  const cancelReorder = useCallback(() => {
    setIsReordering(false);
    setPendingOrder(null);
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleDragStart = useCallback((idx: number) => {
    setDraggedIdx(idx);
    setDragOverIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback(() => {
    if (draggedIdx === null || dragOverIdx === null || !pendingOrder) return;
    const list = [...pendingOrder];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    setPendingOrder(list);
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, [draggedIdx, dragOverIdx, pendingOrder]);

  const handleDragEnd = useCallback(() => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, []);

  // Compute the visual display list (with drag preview applied)
  const baseList = isReordering && pendingOrder !== null ? pendingOrder : sorted;

  const displayList = useMemo(() => {
    if (!isReordering || draggedIdx === null || dragOverIdx === null) return baseList;
    const list = [...baseList];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [baseList, draggedIdx, dragOverIdx, isReordering]);

  return {
    isReordering,
    pendingOrder,
    isDirty,
    enterReorder,
    saveOrder,
    cancelReorder,
    draggedIdx,
    dragOverIdx,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    displayList,
    baseList,
  };
}
