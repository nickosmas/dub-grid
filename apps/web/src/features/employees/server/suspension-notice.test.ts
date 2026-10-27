// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.fn((task: () => unknown) => void task());
const sendResendEmail = vi.fn();
const getInvitationEmailConfig = vi.fn();
const dispatchNotificationEvent = vi.fn();
const getUserById = vi.fn();
const orgName = vi.fn();
const employeeRow = vi.fn();
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
vi.mock("@/features/notifications/server", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { admin: { getUserById: (id: string) => getUserById(id) } },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve({ data: table === "employees" ? employeeRow() : orgName() }),
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/email", () => ({ emailBaseUrl: () => "https://app.test" }));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { scheduleSuspensionNotice } from "./suspension-notice";

const INPUT = { orgId: "org-1", empId: "emp-1", actorId: "actor-1" };

describe("scheduleSuspensionNotice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvitationEmailConfig.mockReturnValue({ apiKey: "key", from: "DubGrid <no-reply@test>" });
    getUserById.mockResolvedValue({ data: { user: { email: "priya@example.com" } } });
    orgName.mockReturnValue({ name: "Calm Haven" });
    employeeRow.mockReturnValue({ user_id: "user-1" });
    sendResendEmail.mockResolvedValue({ id: "email-1" });
    dispatchNotificationEvent.mockResolvedValue({ success: true });
  });

  it("emails their own address and alerts the Super Admins, after the response", async () => {
    scheduleSuspensionNotice(INPUT);
    await vi.waitFor(() => expect(sendResendEmail).toHaveBeenCalledOnce());

    expect(after).toHaveBeenCalledOnce();
    expect(getUserById).toHaveBeenCalledWith("user-1");
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "priya@example.com",
        subject: "Your access to Calm Haven is suspended",
        html: expect.stringContaining("Your access to Calm Haven is suspended"),
      }),
    );
    expect(dispatchNotificationEvent).toHaveBeenCalledWith("actor-1", {
      action: "employee_suspended",
      orgId: "org-1",
      empId: "emp-1",
    });
  });

  it("still alerts when they have no account to email", async () => {
    employeeRow.mockReturnValue({ user_id: null });

    scheduleSuspensionNotice(INPUT);
    await vi.waitFor(() => expect(dispatchNotificationEvent).toHaveBeenCalledOnce());

    expect(getUserById).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("reports a failed email without stopping the alert", async () => {
    sendResendEmail.mockRejectedValueOnce(new Error("provider down"));

    scheduleSuspensionNotice(INPUT);
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledOnce());

    expect(dispatchNotificationEvent).toHaveBeenCalledOnce();
  });
});
