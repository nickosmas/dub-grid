import { vi } from "vitest";

/** A service client `from` that answers the internal-accounts lookup with `internalIds`. */
export function internalProfilesFrom(internalIds: string[], other?: (table: string) => unknown) {
  return vi.fn((table: string) => {
    if (table !== "profiles") return other?.(table);
    const query = {
      select: () => query,
      eq: () => query,
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: internalIds.map((id) => ({ id })), error: null }).then(resolve),
    };
    return query;
  });
}

export const VIEWERS = {
  client: { actor: { id: "client-user" }, isGridmaster: false },
  internal: { actor: { id: "qa-viewer" }, isGridmaster: false },
  gridmaster: { actor: { id: "gridmaster-user" }, isGridmaster: true },
} as const;

/** The internal accounts the viewer cases share: the internal viewer is one of them. */
export const INTERNAL_IDS = ["qa-person", "qa-viewer"];
