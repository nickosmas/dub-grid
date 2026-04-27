import type { PublishChange, ShiftMap } from "@/types";

function formatCompactGridAuditName(fullName: string): string | null {
  const parts = fullName.split(" ").filter(Boolean);
  const compact =
    parts.length <= 1
      ? parts[0] ?? null
      : `${parts[0][0]}. ${parts[parts.length - 1]}`;

  if (!compact) return null;
  return compact.length > 14 ? `${compact.slice(0, 13)}\u2026` : compact;
}

export function resolveGridAuditLabel(args: {
  cellKey: string;
  shifts: ShiftMap;
  publishChangesMap?: ReadonlyMap<
    string,
    Pick<PublishChange, "updatedBy"> & { publishedBy?: string | null }
  > | null;
  auditNames: Map<string, string>;
  currentUserId?: string | null;
}): string | null {
  const { cellKey, shifts, publishChangesMap, auditNames, currentUserId } =
    args;
  const entry = shifts[cellKey];

  let userId: string | null = null;
  if (entry) {
    userId = entry.updatedBy || entry.createdBy || null;
  } else if (publishChangesMap) {
    const publishChange = publishChangesMap.get(cellKey);
    userId = publishChange?.updatedBy || publishChange?.publishedBy || null;
  }

  if (!userId) return null;
  if (currentUserId && userId === currentUserId) return "Me";

  const fullName = auditNames.get(userId);
  if (!fullName) return null;

  return formatCompactGridAuditName(fullName);
}
