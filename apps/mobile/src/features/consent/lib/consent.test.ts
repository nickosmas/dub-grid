import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const fetchMock = vi.fn();
const store = new Map<string, string>();

vi.mock("../../../shared/lib/session", () => ({
  secureStoreAdapter: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
  },
}));
vi.mock("../../../shared/lib/env", () => ({
  getMobileEnvConfig: () => ({ apiBaseUrl: "https://app.example.test" }),
}));
vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ auth: { getSession } }),
}));

import {
  CONSENT_VERSION,
  ensureConsentRecorded,
  setStoredConsent,
  syncConsentToServer,
} from "./consent";

const prefs = { essential: true as const, analytics: true, version: CONSENT_VERSION };

function respond(userId: string | null) {
  return { ok: true, json: async () => ({ success: true, userId }) };
}

function sentHeaders(): Record<string, string> {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return fetchMock.mock.calls[0][1].headers;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  fetchMock.mockResolvedValue(respond(null));
  getSession.mockResolvedValue({ data: { session: null } });
  vi.stubGlobal("fetch", fetchMock);
});

describe("syncConsentToServer", () => {
  it("names a signed-in person with their Bearer token", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "access-token" } } });

    await syncConsentToServer(prefs);

    expect(fetchMock.mock.calls[0][0]).toBe("https://app.example.test/api/consent");
    expect(sentHeaders()).toMatchObject({
      Authorization: "Bearer access-token",
      Origin: "https://app.example.test",
    });
  });

  it("sends no Authorization header when signed out", async () => {
    await syncConsentToServer(prefs);

    expect(sentHeaders()).not.toHaveProperty("Authorization");
  });

  it("still records anonymously when the session can't be read", async () => {
    getSession.mockRejectedValue(new Error("storage unavailable"));

    await syncConsentToServer(prefs);

    expect(sentHeaders()).not.toHaveProperty("Authorization");
  });
});

describe("ensureConsentRecorded", () => {
  it("re-sends a failed save on the next check, then stops once recorded", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await setStoredConsent(true);

    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("records an anonymous choice again once someone signs in", async () => {
    await setStoredConsent(false);
    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(respond("user-1"));
    await ensureConsentRecorded("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await ensureConsentRecorded("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends nothing before a choice is made", async () => {
    await ensureConsentRecorded("user-1");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
