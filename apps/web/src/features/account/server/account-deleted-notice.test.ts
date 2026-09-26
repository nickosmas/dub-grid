// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.fn((task: () => unknown) => void task());
const sendResendEmail = vi.fn();
const getInvitationEmailConfig = vi.fn();
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
vi.mock("@/lib/email", () => ({ emailBaseUrl: () => "https://app.test" }));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { ACCOUNT_DELETED_SUBJECT, scheduleAccountDeletedNotice } from "./account-deleted-notice";

describe("scheduleAccountDeletedNotice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <no-reply@test>" });
    sendResendEmail.mockResolvedValue({ id: "email-1" });
  });

  it("emails the deleted account's address after the response", async () => {
    scheduleAccountDeletedNotice("person@example.com");
    await vi.waitFor(() => expect(sendResendEmail).toHaveBeenCalledOnce());

    expect(after).toHaveBeenCalledOnce();
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "person@example.com",
        subject: ACCOUNT_DELETED_SUBJECT,
        html: expect.stringContaining("Your DubGrid account has been deleted"),
      }),
    );
  });

  it("sends nothing without an address or an email provider", async () => {
    scheduleAccountDeletedNotice(null);
    expect(after).not.toHaveBeenCalled();

    getInvitationEmailConfig.mockReturnValueOnce(null);
    scheduleAccountDeletedNotice("person@example.com");
    await vi.waitFor(() => expect(after).toHaveBeenCalledOnce());
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("reports a failed send instead of throwing", async () => {
    sendResendEmail.mockRejectedValueOnce(new Error("provider down"));
    scheduleAccountDeletedNotice("person@example.com");

    await vi.waitFor(() => expect(captureException).toHaveBeenCalledOnce());
  });
});
