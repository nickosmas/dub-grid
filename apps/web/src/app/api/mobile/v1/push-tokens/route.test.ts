import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const upsertMobilePushToken = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  upsertMobilePushToken,
}));

describe("POST /api/mobile/v1/push-tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers an Expo push token for the authenticated mobile user", async () => {
    requireMobileAuth.mockResolvedValue({
      user: {
        id: "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      },
      currentOrg: {
        id: "51808557-b0aa-49e9-96d6-4c1a0df8d91c",
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/push-tokens", {
        method: "POST",
        body: JSON.stringify({
          platform: "ios",
          expoPushToken: "ExponentPushToken[test-token]",
        }),
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(upsertMobilePushToken).toHaveBeenCalledWith({
      userId: "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      orgId: "51808557-b0aa-49e9-96d6-4c1a0df8d91c",
      platform: "ios",
      expoPushToken: "ExponentPushToken[test-token]",
      disabled: undefined,
    });
    expect(payload).toEqual({ success: true });
  });

  it("rejects malformed payloads", async () => {
    requireMobileAuth.mockResolvedValue({
      user: {
        id: "42d799c8-0fa8-4d4d-a080-60fe3c3bc215",
      },
      currentOrg: {
        id: "51808557-b0aa-49e9-96d6-4c1a0df8d91c",
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/mobile/v1/push-tokens", {
        method: "POST",
        body: JSON.stringify({
          platform: "web",
          expoPushToken: "",
        }),
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Check the request details and try again.",
    });
    expect(upsertMobilePushToken).not.toHaveBeenCalled();
  });
});
