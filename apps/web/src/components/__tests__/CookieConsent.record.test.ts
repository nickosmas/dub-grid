import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureConsentRecorded, setCookieConsent } from "@/components/CookieConsent";

const fetchMock = vi.fn();

function respond(userId: string | null) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ success: true, userId }),
  };
}

function refuse(status: number, retryAfter?: string) {
  const headers = new Headers(retryAfter ? { "Retry-After": retryAfter } : {});
  return { ok: false, status, headers, json: async () => ({}) };
}

function clearConsentCookie() {
  document.cookie = "dubgrid-cookie-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

describe("consent record retries", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    clearConsentCookie();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-sends a failed save on the next check, then stops once recorded", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    fetchMock.mockResolvedValue(respond(null));
    setCookieConsent(true);

    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      consent: { essential: true, analytics: true },
    });

    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-sends a server error the same way", async () => {
    fetchMock.mockResolvedValueOnce(refuse(500));
    fetchMock.mockResolvedValue(respond(null));
    setCookieConsent(false);

    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("records an anonymous choice again once someone signs in", async () => {
    fetchMock.mockResolvedValueOnce(respond(null));
    setCookieConsent(true);
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

  it("waits out Retry-After after a 429 instead of asking on every page load", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T03:00:00Z"));
    fetchMock.mockResolvedValueOnce(refuse(429, "60"));
    fetchMock.mockResolvedValue(respond(null));
    setCookieConsent(true);

    await ensureConsentRecorded(null);
    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-26T03:01:01Z"));
    await ensureConsentRecorded(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
