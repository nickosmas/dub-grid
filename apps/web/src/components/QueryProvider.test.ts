import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";

vi.mock("@/components/AuthenticatedCacheBoundary", () => ({ default: () => null }));
vi.mock("@/lib/cache-broadcast", () => ({ listenForInvalidations: () => () => {} }));

const { makeQueryClient } = await import("./QueryProvider");

const flags = { stripe: false, csvImport: true, csvExport: true, reports: false, printing: true };

describe("makeQueryClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the layout's feature flags so the first read needs no request", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const client = makeQueryClient({ flags, readAt: 1_000_000 - 5_000 });
    const query = client.getQueryCache().find({ queryKey: queryKeys.featureFlags() });

    expect(client.getQueryData(queryKeys.featureFlags())).toEqual(flags);
    expect(query?.state.dataUpdatedAt).toBe(1_000_000 - 5_000);
    expect(query?.isStaleByTime(30_000)).toBe(false);
  });

  it("never dates the flags after this clock's now", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const client = makeQueryClient({ flags, readAt: 1_000_000 + 60_000 });
    const query = client.getQueryCache().find({ queryKey: queryKeys.featureFlags() });

    expect(query?.state.dataUpdatedAt).toBe(1_000_000);
  });

  it("leaves the cache empty without seeded flags", () => {
    expect(makeQueryClient().getQueryData(queryKeys.featureFlags())).toBeUndefined();
  });
});
