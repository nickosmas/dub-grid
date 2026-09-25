// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendResendEmail = vi.fn();

vi.mock("@/lib/resend", () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
}));
vi.mock("@/lib/env.server", () => ({ serverEnv: {} }));

const { sendInvitationEmail } = await import("./invitation-email");

const input = {
  config: { apiKey: "key", from: "DubGrid <invites@dubgrid.test>" },
  token: "tok",
  email: "ada@example.com",
  orgName: "Calm Haven",
  expiresAt: "2026-09-28T22:04:00.000Z",
  timeZone: "America/Los_Angeles",
};

function sent() {
  return sendResendEmail.mock.calls[0]?.[0] as { subject: string; html: string };
}

describe("sendInvitationEmail", () => {
  beforeEach(() => {
    sendResendEmail.mockReset();
    sendResendEmail.mockResolvedValue(undefined);
  });

  it("sends a first invitation under the invited subject", async () => {
    await sendInvitationEmail({ ...input, kind: "new" });

    expect(sent().subject).toBe("You're invited to join Calm Haven on DubGrid");
  });

  it("sends a reissue under its own subject, so the newest email is findable", async () => {
    await sendInvitationEmail({ ...input, kind: "reissue" });

    expect(sent().subject).toBe("Your new invitation to join Calm Haven on DubGrid");
    expect(sent().html).toContain("It replaces your earlier one");
  });

  it("states the deadline in the organization's timezone", async () => {
    await sendInvitationEmail({ ...input, kind: "new" });

    expect(sent().html).toContain("Monday, September 28, 2026 at 3:04 PM Pacific Daylight Time");
  });
});
