import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTermsAcceptanceStatus, recordCurrentTermsAcceptance } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("terms API recovery metadata", () => {
  it("keeps a temporary response classifiable without exposing its body to the UI", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "private service detail" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchTermsAcceptanceStatus()).rejects.toMatchObject({ status: 503 });
  });

  it("gives the acceptance mutation an abortable request deadline", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(recordCurrentTermsAcceptance()).resolves.toEqual({ success: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/account/terms",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });
});
