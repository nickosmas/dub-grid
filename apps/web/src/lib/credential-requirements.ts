/**
 * Shared role-certification requirement semantics.
 */

export { satisfiesCertificationRequirement } from "@dubgrid/domain";

export type RequirementItem = {
  id: number;
  name: string;
  abbr?: string;
};

function label(item: RequirementItem): string {
  return item.abbr || item.name || "";
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
