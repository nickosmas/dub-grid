// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { getProxyJwks, resetSupabaseJwksCache } from "./verify-token";

const SUPABASE_URL = "https://project.supabase.co";

async function signingKey(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
  const sign = () =>
    new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "ES256", kid })
      .setExpirationTime("5m")
      .sign(privateKey);
  return { jwk, sign };
}

describe("getProxyJwks", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    resetSupabaseJwksCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetSupabaseJwksCache();
  });

  it("verifies with the keys shipped with the build, without asking Supabase", async () => {
    const shipped = await signingKey("shipped");
    vi.stubEnv("SUPABASE_JWKS", JSON.stringify({ keys: [shipped.jwk] }));

    const { payload } = await jwtVerify(await shipped.sign(), getProxyJwks()!);

    expect(payload.sub).toBe("user-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Supabase for a key added after the build", async () => {
    const shipped = await signingKey("shipped");
    const rotated = await signingKey("rotated");
    vi.stubEnv("SUPABASE_JWKS", JSON.stringify({ keys: [shipped.jwk] }));
    fetchMock.mockResolvedValue(Response.json({ keys: [shipped.jwk, rotated.jwk] }));

    const { payload } = await jwtVerify(await rotated.sign(), getProxyJwks()!);

    expect(payload.sub).toBe("user-1");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
    );
  });

  it("still refuses a token the shipped key did not sign", async () => {
    const shipped = await signingKey("shipped");
    const forger = await signingKey("shipped");
    vi.stubEnv("SUPABASE_JWKS", JSON.stringify({ keys: [shipped.jwk] }));

    await expect(jwtVerify(await forger.sign(), getProxyJwks()!)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches remotely, as before, when the build shipped no keys", async () => {
    const remote = await signingKey("remote");
    fetchMock.mockResolvedValue(Response.json({ keys: [remote.jwk] }));

    await jwtVerify(await remote.sign(), getProxyJwks()!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
