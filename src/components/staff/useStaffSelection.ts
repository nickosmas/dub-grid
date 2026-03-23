import { useState, useCallback } from "react";
import { Employee } from "@/types";

export function useStaffSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((empId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((list: Employee[]) => {
    setSelectedIds((prev) => {
      const allSelected = list.every((e) => prev.has(e.id));
      if (allSelected) return new Set<string>();
      return new Set(list.map((e) => e.id));
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = useCallback(
    (list: Employee[]) => list.length > 0 && list.every((e) => selectedIds.has(e.id)),
    [selectedIds],
  );

  return {
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    isAllSelected,
    selectionCount: selectedIds.size,
  };
}
