/**
 * Shared role-certification requirement semantics.
 */

export type RequirementItem = {
  id: number;
  name: string;
  abbr?: string;
};

function label(item: RequirementItem): string {
  return item.abbr || item.name || "";
}

/**
 * Does something the person holds satisfy this requirement?
 *
 * Note there is deliberately no "and" mode. `employees.certification_id` is
 * singular, so a conjunction over required certifications is unsatisfiable.
 * (`jobs.eligibility_mode` is a different thing: it combines the role gate with
 * the certification gate, not members within one gate.)
 */
export function satisfiesCertificationRequirement({
  heldIds,
  requiredIds,
}: {
  heldIds: Array<number | null | undefined>;
  requiredIds: number[];
}): boolean {
  // An empty requirement means "anyone", whatever the mode says.
  if (requiredIds.length === 0) return true;

  const held = heldIds.filter((id): id is number => typeof id === "number");
  if (held.length === 0) return false;

  return held.some((id) => requiredIds.includes(id));
}

/**
 * Human wording for a requirement, e.g. "CSN II or higher", "CSN II or CSN III",
 * or "CSN II or higher, or ACLS" for a set mixing ranked and lateral items.
 */
export function describeCertificationRequirement({
  requiredIds,
  itemsById,
  emptyText = "anyone",
}: {
  requiredIds: number[];
  itemsById: Map<number, RequirementItem>;
  emptyText?: string;
}): string {
  const items = requiredIds
    .map((id) => itemsById.get(id))
    .filter((item): item is RequirementItem => Boolean(item));

  if (items.length === 0) return emptyText;

  const names = items.map(label).filter((name) => name.trim().length > 0);
  return names.length > 0 ? joinWithOr(names) : emptyText;
}

function joinWithOr(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}
