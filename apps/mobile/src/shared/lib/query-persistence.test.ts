import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => stored.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => void stored.set(key, value)),
    removeItem: vi.fn(async (key: string) => void stored.delete(key)),
  },
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "1.0.0" } } }));

const { queryClient } = await import("./query-client");
const { clearQueryCache, shouldPersistQuery, startQueryPersistence } =
  await import("./query-persistence");

const succeeded = (queryKey: unknown[]) => ({ queryKey, state: { status: "success" } }) as never;

describe("shouldPersistQuery", () => {
  it("keeps the bootstrap and the queries Home opens with", () => {
    expect(shouldPersistQuery(succeeded(["mobile", "bootstrap", "user-1", "org-1"]))).toBe(true);
    expect(shouldPersistQuery(succeeded(["mobile", "dashboard", "id", "a", "b"]))).toBe(true);
    expect(
      shouldPersistQuery(succeeded(["mobile", "dashboard", "my-schedule", "id", "a", "b"])),
    ).toBe(true);
    expect(shouldPersistQuery(succeeded(["mobile", "schedule", "mine", "id", "a", "b"]))).toBe(
      true,
    );
    expect(
      shouldPersistQuery(succeeded(["mobile", "requests", ["authenticated", "u", "o"], "a", "b"])),
    ).toBe(true);
  });

  it("leaves everything else, and anything that has not answered, in memory only", () => {
    expect(shouldPersistQuery(succeeded(["mobile", "schedule", "team", "id", "a", "b"]))).toBe(
      false,
    );
    expect(shouldPersistQuery(succeeded(["mobile", "requests", "history", "id", 20]))).toBe(false);
    expect(shouldPersistQuery(succeeded(["mobile", "people", "id"]))).toBe(false);
    expect(shouldPersistQuery(succeeded(["mobile", "profile", "id"]))).toBe(false);
    expect(
      shouldPersistQuery({
        queryKey: ["mobile", "bootstrap", "user-1", "org-1"],
        state: { status: "error" },
      } as never),
    ).toBe(false);
  });
});

describe("query persistence", () => {
  beforeEach(() => {
    stored.clear();
    queryClient.clear();
  });

  it("restores a stored bootstrap into the cache on the next launch", async () => {
    await startQueryPersistence();
    queryClient.setQueryData(["mobile", "bootstrap", "user-1", "org-1"], { effectiveRole: "user" });
    queryClient.setQueryData(["mobile", "people", "user-1:org-1"], [{ id: 1 }]);
    // Saves are throttled to one a second, so the answered state lands on the trailing save.
    await vi.waitFor(() => expect(stored.get("dubgrid-query-cache")).toContain("bootstrap"), {
      timeout: 3_000,
    });

    // A new launch: what the device kept, read into an empty cache.
    const kept = stored.get("dubgrid-query-cache")!;
    queryClient.clear();
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    stored.set("dubgrid-query-cache", kept);
    await startQueryPersistence();

    expect(queryClient.getQueryData(["mobile", "bootstrap", "user-1", "org-1"])).toEqual({
      effectiveRole: "user",
    });
    expect(queryClient.getQueryData(["mobile", "people", "user-1:org-1"])).toBeUndefined();
  });

  it("removes the stored copy when the cache is cleared", async () => {
    stored.set("dubgrid-query-cache", "{}");

    clearQueryCache();

    await vi.waitFor(() => expect(stored.has("dubgrid-query-cache")).toBe(false));
  });
});
