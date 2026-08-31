import { satisfiesCertificationRequirement } from "@dubgrid/domain";

type Role = {
  requiredCertificationIds?: number[];
};

type Certification = {
  id: number;
  name: string;
  abbr: string;
};

export function isRoleCertificationBlocked(input: {
  role: Role;
  certificationId: number | null;
  selectedRoleIds: number[];
  roleId: number;
}): boolean {
  if (input.selectedRoleIds.includes(input.roleId)) return false;

  return !satisfiesCertificationRequirement({
    heldIds: [input.certificationId],
    requiredIds: input.role.requiredCertificationIds ?? [],
  });
}

export function getRoleCertificationRequirement(input: {
  role: Role;
  certifications: Certification[];
  certificationLabel: string;
  useCompactLabels: boolean;
}): string {
  const certificationById = new Map(input.certifications.map((item) => [item.id, item]));
  const labels = (input.role.requiredCertificationIds ?? [])
    .map((id) => certificationById.get(id))
    .filter((item): item is Certification => Boolean(item))
    .map((item) => (input.useCompactLabels ? item.abbr || item.name : item.name));

  if (labels.length === 0) return `Requires a ${input.certificationLabel.toLowerCase()}`;
  return `Requires ${labels.join(" or ")}`;
}
