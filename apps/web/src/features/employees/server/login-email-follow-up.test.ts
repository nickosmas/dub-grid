// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const endUserSessions = vi.fn();
const sendResendEmail = vi.fn();
const getInvitationEmailConfig = vi.fn();
const captureException = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/revocation", () => ({
  endUserSessions: (...args: unknown[]) => endUserSessions(...args),
}));
vi.mock("@/lib/resend", () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
}));
vi.mock("@/features/mobile/server/invitation-email", () => ({
  getInvitationEmailConfig: () => getInvitationEmailConfig(),
}));
vi.mock("@/lib/email", () => ({
  emailBaseUrl: () => "https://app.test",
  sanitizeHeaderValue: (value: string) => value,
}));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { followUpLinkedLoginEmailChange } from "./login-email-follow-up";

const serviceClient = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { name: "Calm Haven" }, error: null }) }),
    }),
  }),
};

function change(overrides: Partial<Parameters<typeof followUpLinkedLoginEmailChange>[0]> = {}) {
  return followUpLinkedLoginEmailChange({
    serviceClient: serviceClient as never,
    userId: "member-1",
    previousEmail: "old@example.com",
    newEmail: "new@example.com",
    orgId: "org-1",
    actorId: "manager-1",
    actorSessionId: "manager-session",
    ...overrides,
  });
}

function sentTo(address: string) {
  return sendResendEmail.mock.calls
    .map((call) => call[0] as { to: string; subject: string; html: string })
    .find((message) => message.to === address);
}

describe("followUpLinkedLoginEmailChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    endUserSessions.mockResolvedValue(undefined);
    sendResendEmail.mockResolvedValue({ id: "email-1" });
    getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <a@b.c>" });
  });

  it("signs the member out everywhere and tells both addresses", async () => {
    await change();

    // Ended, not just rejected: a refresh must not restore access.
    expect(endUserSessions).toHaveBeenCalledWith("member-1", { keepSessionId: null });
    expect(sentTo("old@example.com")?.html).toContain("new@example.com");
    expect(sentTo("old@example.com")?.html).toContain("Calm Haven");
    expect(sentTo("new@example.com")?.html).toContain("Calm Haven");
  });

  // The new address was typed by an administrator and may be a stranger's.
  it("never shows the previous address, or anyone's name, to the new one", async () => {
    await change();

    const html = sentTo("new@example.com")?.html ?? "";
    expect(html).not.toContain("old@example.com");
    expect(html).not.toContain("manager-1");
  });

  it("keeps the acting session when someone changes their own sign-in email", async () => {
    await change({ userId: "manager-1" });

    expect(endUserSessions).toHaveBeenCalledWith("manager-1", {
      keepSessionId: "manager-session",
    });
  });

  it("still sends both notices when revocation fails, and reports it", async () => {
    endUserSessions.mockRejectedValue(new Error("redis down"));

    await expect(change()).resolves.toBeUndefined();

    expect(sendResendEmail).toHaveBeenCalledTimes(2);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: expect.objectContaining({ step: "revoke-sessions" }) }),
    );
  });

  it("reports a failed notice without failing the committed change", async () => {
    sendResendEmail.mockRejectedValueOnce(new Error("resend down"));

    await expect(change()).resolves.toBeUndefined();

    expect(endUserSessions).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: expect.objectContaining({ step: "notify" }) }),
    );
  });
});
