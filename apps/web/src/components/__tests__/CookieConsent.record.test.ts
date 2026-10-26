import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureConsentRecorded, setCookieConsent } from "@/components/CookieConsent";

const fetchMock = vi.fn();

function respond(userId: string | null) {
  return { ok: true, json: async () => ({ success: true, userId }) };
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
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
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
});
