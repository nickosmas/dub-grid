interface OrderableFocusArea {
  departmentId: number | null;
  sortOrder: number;
}

interface OrderingDepartment {
  id: number;
  type: string;
  sortOrder: number;
}

/**
 * Focus areas in the order the schedule shows them: grouped by their
 * scheduled department's order, then by their own order within it. A focus
 * area's `sortOrder` alone is only meaningful inside its department, so
 * ordering by it across departments interleaves them. Web and the mobile API
 * both use this, so the app lists them in the order Settings shows.
 */
export function orderFocusAreasByDepartment<T extends OrderableFocusArea>(
  focusAreas: readonly T[],
  departments: readonly OrderingDepartment[],
): T[] {
  const departmentRank = new Map(
    departments
      .filter((department) => department.type === "scheduled")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((department, index) => [department.id, index]),
  );
  const rankOf = (focusArea: T) =>
    focusArea.departmentId != null
      ? (departmentRank.get(focusArea.departmentId) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;

  return focusAreas
    .map((focusArea, index) => ({ focusArea, index, rank: rankOf(focusArea) }))
    .sort(
      (a, b) =>
        a.rank - b.rank || a.focusArea.sortOrder - b.focusArea.sortOrder || a.index - b.index,
    )
    .map(({ focusArea }) => focusArea);
}
