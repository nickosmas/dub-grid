// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Collects each task so a test can wait for the work itself, not just for
// after() to have been called.
const scheduled: Array<Promise<unknown>> = [];
const after = vi.fn((task: () => unknown) => {
  scheduled.push(Promise.resolve(task()));
});
const settled = () => Promise.all(scheduled.splice(0));
const loggerWarn = vi.fn();
const sendResendEmail = vi.fn();
const getInvitationEmailConfig = vi.fn();
const getUserById = vi.fn();
const orgName = vi.fn();
const captureException = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => after(task),
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
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { admin: { getUserById: (...args: unknown[]) => getUserById(...args) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => orgName() }) }) }),
  }),
}));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: (...args: unknown[]) => loggerWarn(...args) },
}));

import { scheduleImpersonationNotice } from "./impersonation-notice";

const notice = {
  kind: "start" as const,
  targetUserId: "user-1",
  targetOrgId: "org-1",
  expiresAt: "2026-09-28T22:04:00.000Z",
};

describe("scheduleImpersonationNotice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <no-reply@test>" });
    getUserById.mockResolvedValue({ data: { user: { email: "person@example.com" } }, error: null });
    orgName.mockResolvedValue({
      data: { name: "Calm Haven", timezone: "America/Los_Angeles" },
      error: null,
    });
    sendResendEmail.mockResolvedValue({ id: "email-1" });
  });

  it("emails the account's own address after the response", async () => {
    scheduleImpersonationNotice(notice);
    await vi.waitFor(() => expect(sendResendEmail).toHaveBeenCalledOnce());

    expect(after).toHaveBeenCalledOnce();
    expect(getUserById).toHaveBeenCalledWith("user-1");
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "person@example.com",
        subject: "DubGrid support is using your account in Calm Haven",
        html: expect.stringContaining("This access ends by"),
      }),
    );
  });

  it("sends nothing without an email provider or an address", async () => {
    getInvitationEmailConfig.mockReturnValueOnce(null);
    scheduleImpersonationNotice(notice);
    await settled();
    expect(loggerWarn).toHaveBeenCalledOnce();

    getUserById.mockResolvedValueOnce({ data: { user: { email: null } }, error: null });
    scheduleImpersonationNotice(notice);
    await settled();

    expect(getUserById).toHaveBeenCalledOnce();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("reports a failed send instead of throwing", async () => {
    sendResendEmail.mockRejectedValueOnce(new Error("provider down"));
    scheduleImpersonationNotice(notice);

    await vi.waitFor(() => expect(captureException).toHaveBeenCalledOnce());
  });
});
