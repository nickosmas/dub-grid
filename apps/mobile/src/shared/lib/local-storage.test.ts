import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const store = new Map<string, string>();
const getItemAsync = vi.fn(async (key: string) => store.get(key) ?? null);
const setItemAsync = vi.fn(async (key: string, value: string) => {
  store.set(key, value);
});
const deleteItemAsync = vi.fn(async (key: string) => {
  store.delete(key);
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => getItemAsync(key),
  setItemAsync: (key: string, value: string) => setItemAsync(key, value),
  deleteItemAsync: (key: string) => deleteItemAsync(key),
}));

async function loadStorage() {
  vi.resetModules();
  return import("./local-storage");
}

describe("local storage on a phone", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("reads SecureStore once and answers later reads from memory", async () => {
    store.set("session", "token-1");
    const { getStoredValue } = await loadStorage();

    await expect(getStoredValue("session")).resolves.toBe("token-1");
    await expect(getStoredValue("session")).resolves.toBe("token-1");

    expect(getItemAsync).toHaveBeenCalledTimes(1);
  });

  it("shares one read between callers that ask at the same time", async () => {
    store.set("session", "token-1");
    const { getStoredValue } = await loadStorage();

    const values = await Promise.all([getStoredValue("session"), getStoredValue("session")]);

    expect(values).toEqual(["token-1", "token-1"]);
    expect(getItemAsync).toHaveBeenCalledTimes(1);
  });

  it("writes through, so a read after a set needs no SecureStore read", async () => {
    const { getStoredValue, setStoredValue } = await loadStorage();

    await setStoredValue("session", "token-2");

    await expect(getStoredValue("session")).resolves.toBe("token-2");
    expect(store.get("session")).toBe("token-2");
    expect(getItemAsync).not.toHaveBeenCalled();
  });

  it("forgets the value on remove, so sign-out leaves nothing to read", async () => {
    store.set("session", "token-1");
    const { getStoredValue, removeStoredValue } = await loadStorage();
    await getStoredValue("session");

    await removeStoredValue("session");

    await expect(getStoredValue("session")).resolves.toBeNull();
    expect(store.has("session")).toBe(false);
    expect(getItemAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps a write made while an older read was still in flight", async () => {
    store.set("session", "old");
    let finishRead: (value: string | null) => void = () => {};
    getItemAsync.mockImplementationOnce(
      () => new Promise<string | null>((resolve) => (finishRead = resolve)),
    );
    const { getStoredValue, setStoredValue } = await loadStorage();

    const staleRead = getStoredValue("session");
    await setStoredValue("session", "new");
    finishRead("old");
    await staleRead;

    await expect(getStoredValue("session")).resolves.toBe("new");
  });

  it("caches nothing a failed write meant to store", async () => {
    setItemAsync.mockRejectedValueOnce(new Error("keychain locked"));
    store.set("session", "old");
    const { getStoredValue, setStoredValue } = await loadStorage();

    await expect(setStoredValue("session", "new")).rejects.toThrow("keychain locked");

    await expect(getStoredValue("session")).resolves.toBe("old");
    expect(getItemAsync).toHaveBeenCalledTimes(1);
  });
});
