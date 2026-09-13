import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTermsAcceptanceStatus,
  recordCurrentTermsAcceptance,
  requireCredentialAssurance,
  resolvePeopleProfileChangeRequest,
  revokeAccountSession,
} from "./api";

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

describe("single-device revocation assurance", () => {
  it("preserves the server-selected step-up method", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "STEP_UP_REQUIRED",
          method: "totp",
          error: "Confirm your identity, then try again.",
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(revokeAccountSession("selected-device", "original-token")).rejects.toMatchObject({
      status: 403,
      code: "STEP_UP_REQUIRED",
      method: "totp",
    });
  });

  it("sends the exact fresh bearer token and unchanged device with an abortable deadline", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await revokeAccountSession("selected-device", "exact-promoted-token");
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "/api/account/sessions",
      expect.objectContaining({
        method: "DELETE",
        signal: expect.any(AbortSignal),
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer exact-promoted-token",
        },
        body: JSON.stringify({ refreshTokenHash: "selected-device" }),
      }),
    );
  });
});

describe("credential assurance", () => {
  it("sends the exact proof token with an abortable deadline", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(requireCredentialAssurance("exact-proof-token")).resolves.toEqual({
      success: true,
    });
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "/api/account/credential-assurance",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
        headers: { Authorization: "Bearer exact-proof-token" },
      }),
    );
  });

  it("forwards fresh proof to account-deletion approval", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, request: {} }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await resolvePeopleProfileChangeRequest({
      orgId: "org-1",
      requestId: "request-1",
      action: "approve",
      accessToken: "fresh-proof-token",
    });

    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "/api/people/change-requests/request-1?orgId=org-1",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fresh-proof-token",
        },
      }),
    );
  });
});
