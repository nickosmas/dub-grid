// The People list's order, so a person's page can step to the next one (item
// 55b). It lives for the browser tab and holds employee ids only.

const STORAGE_KEY = "dg-people-order";

interface StoredPeopleOrder {
  orgId: string;
  ids: string[];
}

export interface PeopleNeighbors {
  /** 1-based, counting only people who can be stepped to. */
  position: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
}

/** The saved ids for this organization, or null for anything else. */
export function parsePeopleOrder(raw: string | null | undefined, orgId: string): string[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { orgId: savedOrgId, ids } = parsed as Partial<StoredPeopleOrder>;
  if (savedOrgId !== orgId || !Array.isArray(ids)) return null;
  return ids.every((id) => typeof id === "string") ? ids : null;
}

export function savePeopleOrder(orgId: string, ids: readonly string[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ orgId, ids }));
  } catch {
    // Storage blocked: the person page simply offers no arrows.
  }
}

export function readPeopleOrder(orgId: string): string[] | null {
  try {
    return parsePeopleOrder(window.sessionStorage.getItem(STORAGE_KEY), orgId);
  } catch {
    return null;
  }
}

/**
 * Where `currentId` sits among the people that can be stepped to, leaving out
 * `skipIds` (the viewer's own record, which opens their profile instead).
 */
export function findNeighbors(
  ids: readonly string[],
  currentId: string,
  skipIds: ReadonlySet<string> = new Set(),
): PeopleNeighbors | null {
  const steppable = ids.filter((id) => !skipIds.has(id));
  const index = steppable.indexOf(currentId);
  if (index === -1) return null;
  return {
    position: index + 1,
    total: steppable.length,
    previousId: steppable[index - 1] ?? null,
    nextId: steppable[index + 1] ?? null,
  };
}
