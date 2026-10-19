import { describe, expect, it, vi } from "vitest";
import {
  SESSION_PRESENCE_REFRESH_MS,
  getSessionPresenceKey,
  reportSessionPresence,
  shouldReportSessionPresence,
} from "./session-presence-report";

const sleep = vi.fn(async () => undefined);
const refused = (status?: number) => Object.assign(new Error("refused"), { status });

describe("reportSessionPresence", () => {
  it("retries a refused report and resolves once it lands", async () => {
    const send = vi.fn().mockRejectedValueOnce(refused(409)).mockResolvedValueOnce({});

    await expect(
      reportSessionPresence("token", { send, isCurrent: () => true, sleep }),
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("gives up after three attempts", async () => {
    const send = vi.fn().mockRejectedValue(refused());

    await expect(
      reportSessionPresence("token", { send, isCurrent: () => true, sleep }),
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does not retry a refusal that would repeat", async () => {
    const send = vi.fn().mockRejectedValue(refused(401));

    await expect(
      reportSessionPresence("token", { send, isCurrent: () => true, sleep }),
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it("stops once another token has taken over", async () => {
    const send = vi.fn().mockRejectedValue(refused(500));

    await expect(
      reportSessionPresence("token", { send, isCurrent: () => false, sleep }),
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("shouldReportSessionPresence", () => {
  const now = 1_800_000_000_000;

  it("reports a session it has not reported, or another one", () => {
    expect(shouldReportSessionPresence(null, "a", now)).toBe(true);
    expect(shouldReportSessionPresence({ sessionKey: "a", reportedAt: now }, "b", now)).toBe(true);
  });

  it("holds a refresh within the same session until half an hour has passed", () => {
    const last = { sessionKey: "a", reportedAt: now };
    expect(shouldReportSessionPresence(last, "a", now + SESSION_PRESENCE_REFRESH_MS - 1)).toBe(
      false,
    );
    expect(shouldReportSessionPresence(last, "a", now + SESSION_PRESENCE_REFRESH_MS)).toBe(true);
    expect(shouldReportSessionPresence(last, "a", now - 1)).toBe(true);
  });
});

describe("getSessionPresenceKey", () => {
  const tokenFor = (claims: object, version: string) =>
    `header.${btoa(JSON.stringify(claims))}.${version}`;

  it("is the same for every token of one session and differs by organization", () => {
    const claims = { sub: "user-1", org_id: "org-1", session_id: "s-1" };
    expect(getSessionPresenceKey(tokenFor(claims, "v1"))).toBe(
      getSessionPresenceKey(tokenFor(claims, "v2")),
    );
    expect(getSessionPresenceKey(tokenFor({ ...claims, org_id: "org-2" }, "v1"))).not.toBe(
      getSessionPresenceKey(tokenFor(claims, "v1")),
    );
  });

  it("keys a token without a session id on the token itself", () => {
    const token = tokenFor({ sub: "user-1" }, "v1");
    expect(getSessionPresenceKey(token)).toBe(token);
  });
});
