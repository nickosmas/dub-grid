export function satisfiesCertificationRequirement({
  heldIds,
  requiredIds,
}: {
  heldIds: Array<number | null | undefined>;
  requiredIds: number[];
}): boolean {
  if (requiredIds.length === 0) return true;

  const held = heldIds.filter((id): id is number => typeof id === "number");
  return held.some((id) => requiredIds.includes(id));
}
