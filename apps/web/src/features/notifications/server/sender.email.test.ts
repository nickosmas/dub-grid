// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendResendEmail = vi.fn();
const sendMobilePushNotifications = vi.fn();
const pushEligible = vi.fn((_type: string) => false);
const state = {
  securityEmailsThisHour: 0,
  otherEmailsThisHour: 0,
  dedupeHits: 0,
  orgName: null as string | null,
  prefs: null as Record<string, { in_app?: boolean; email?: boolean }> | null,
  profile: { platform_role: "none", deactivated_at: null, terminated_at: null } as Record<
    string,
    unknown
  > | null,
  membership: true,
  employee: { status: "active", suspended_at: null } as Record<string, unknown> | null,
};
const inAppInserts: unknown[] = [];

type Op = [string, ...unknown[]];

function has(ops: Op[], ...op: unknown[]) {
  return ops.some((entry) => op.every((value, index) => entry[index] === value));
}

function resolve(table: string, ops: Op[]) {
  if (table === "profiles") return { data: state.profile, error: null };
  if (table === "organization_memberships") {
    return { data: state.membership ? { user_id: "user-1" } : null, error: null };
  }
  if (table === "employees") return { data: state.employee, error: null };
  if (table === "notifications" && has(ops, "insert")) {
    const row = ops.find(([name]) => name === "insert")?.[1] as { channel?: string };
    if (row?.channel === "in_app") inAppInserts.push(row);
    return { data: { id: "notification-1" }, error: null };
  }
  if (table === "notifications" && has(ops, "select", "*")) {
    return {
      count: has(ops, "eq", "category", "security")
        ? state.securityEmailsThisHour
        : state.otherEmailsThisHour,
    };
  }
  if (table === "notification_preferences") {
    return { data: state.prefs ? { prefs: state.prefs } : null, error: null };
  }
  if (table === "organizations") {
    return { data: state.orgName ? { name: state.orgName } : null, error: null };
  }
  if (table === "notifications" && has(ops, "eq", "metadata->>dedupe_key")) {
    return { data: Array.from({ length: state.dedupeHits }, (_, id) => ({ id })) };
  }
  return { data: null, error: null };
}

function builder(table: string) {
  const ops: Op[] = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "neq", "gte", "limit", "insert", "is"]) {
    chain[name] = (...args: unknown[]) => {
      ops.push([name, ...args]);
      return chain;
    };
  }
  chain.maybeSingle = async () => resolve(table, ops);
  chain.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(resolve(table, ops)).then(onFulfilled);
  return chain;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => builder(table),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "u@x.test" } } }) } },
  }),
}));
vi.mock("@/lib/supabase-keys", () => ({
  getSupabaseUrl: () => "http://supabase.test",
  getSupabaseSecretKey: () => "secret",
}));
vi.mock("@/lib/env.server", () => ({ serverEnv: { RESEND_API_KEY: "key" } }));
vi.mock("@/lib/email", () => ({ emailBaseUrl: () => "https://app.test" }));
vi.mock("@/lib/resend", () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
}));
vi.mock("@/features/mobile/server", () => ({
  isPushEligibleNotificationType: (type: string) => pushEligible(type),
  isAccountWidePushType: (type: string) => type.startsWith("security_"),
  sendMobilePushNotifications: (...args: unknown[]) => sendMobilePushNotifications(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { sendNotification } from "./sender";

function send(type: string, dedupeKey?: string) {
  return sendNotification(
    "user-1",
    "org-1",
    type as never,
    "Title",
    "Message",
    {},
    {
      writeInApp: false,
      dedupeKey,
    },
  );
}

describe("sendNotification email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.securityEmailsThisHour = 0;
    state.otherEmailsThisHour = 0;
    state.dedupeHits = 0;
    state.orgName = null;
    state.prefs = null;
    state.profile = { platform_role: "none", deactivated_at: null, terminated_at: null };
    state.membership = true;
    state.employee = { status: "active", suspended_at: null };
    inAppInserts.length = 0;
    sendResendEmail.mockResolvedValue({ id: "email-1" });
    pushEligible.mockReturnValue(false);
  });

  // Ten unrelated emails in an hour used to suppress a sign-in warning.
  it("still sends a security alert after a burst of ordinary mail", async () => {
    state.otherEmailsThisHour = 10;

    await send("security_new_device");

    expect(sendResendEmail).toHaveBeenCalledTimes(1);
  });

  it("emails the labeled layout while push keeps the one-sentence message", async () => {
    pushEligible.mockReturnValue(true);

    await sendNotification(
      "user-1",
      "org-1",
      "security_new_device" as never,
      "Title",
      "Message",
      {},
      {
        writeInApp: false,
        email: {
          intro: "We noticed a new sign-in.",
          details: [{ label: "Device", value: "Chrome on Macintosh" }],
          closing: "If it wasn't you, contact support@dubgrid.com.",
        },
      },
    );

    const { html } = sendResendEmail.mock.calls[0]?.[0] as { html: string };
    expect(html).toContain("We noticed a new sign-in.");
    expect(html).toMatch(/Device<\/strong>(<!-- -->)?: (<!-- -->)?Chrome on Macintosh/);
    expect(html).toContain("If it wasn&#x27;t you");
    expect(html).not.toContain(">Message<");
    expect(sendMobilePushNotifications).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      expect.objectContaining({ body: "Message" }),
      { accountWide: true },
    );
  });

  it("pushes a security alert to the whole account and other alerts to the organization", async () => {
    pushEligible.mockReturnValue(true);

    await send("security_new_device");
    await send("schedule_published");

    expect(sendMobilePushNotifications).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "org-1",
      expect.any(Object),
      { accountWide: true },
    );
    expect(sendMobilePushNotifications).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "org-1",
      expect.any(Object),
      { accountWide: false },
    );
  });

  it("emails a security alert even when an older save turned security email off", async () => {
    state.prefs = { security: { in_app: false, email: false } };

    await send("security_new_device");

    expect(sendResendEmail).toHaveBeenCalledTimes(1);
  });

  it("tells the reader a security alert is always on, and others how to change them", async () => {
    await send("security_new_device");
    await send("billing_payment_failed");

    const [security, billing] = sendResendEmail.mock.calls.map(
      (call) => (call[0] as { html: string }).html,
    );
    expect(security).toContain("Security alerts are always on");
    expect(security).not.toContain("manage your notification preferences");
    expect(billing).toContain("manage your notification preferences");
  });

  it("still honors an email preference for other categories", async () => {
    state.prefs = { billing: { in_app: true, email: false } };

    await send("billing_payment_failed");

    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("still throttles ordinary mail at its own limit", async () => {
    state.otherEmailsThisHour = 10;

    await send("billing_payment_failed");

    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("caps security alerts on their own budget", async () => {
    state.securityEmailsThisHour = 20;

    await send("security_mfa_changed");

    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("sends one email per dedupe key", async () => {
    state.dedupeHits = 1;

    await send("security_new_device", "security_new_device:session-1");

    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("names the organization in an organization notification's subject and body", async () => {
    state.orgName = "Calm Haven";

    await send("billing_payment_failed");

    const message = sendResendEmail.mock.calls[0]?.[0] as { subject: string; html: string };
    expect(message.subject).toBe("Calm Haven: Title");
    expect(message.html).toContain("Calm Haven");
  });

  // A security alert is about the sign-in, which the organization does not own.
  it("names the organization only as where a security alert's user was signed in", async () => {
    state.orgName = "Calm Haven";

    await send("security_new_device");

    const message = sendResendEmail.mock.calls[0]?.[0] as { subject: string; html: string };
    expect(message.subject).toBe("Title");
    expect(message.html).toContain("While signed in to Calm Haven");
  });
});

// Item 51j: push and email reach only someone who can still sign in.
describe("sendNotification reaches only people who can sign in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.securityEmailsThisHour = 0;
    state.otherEmailsThisHour = 0;
    state.dedupeHits = 0;
    state.orgName = null;
    state.prefs = {
      schedule: { email: true },
      shift_requests: { email: true },
      billing: { email: true },
    };
    state.profile = { platform_role: "none", deactivated_at: null, terminated_at: null };
    state.membership = true;
    state.employee = { status: "active", suspended_at: null };
    inAppInserts.length = 0;
    sendResendEmail.mockResolvedValue({ id: "email-1" });
    pushEligible.mockReturnValue(true);
  });

  function alert(type: string) {
    return sendNotification("user-1", "org-1", type as never, "Title", "Message");
  }

  const families = ["shift_change", "shift_request_approved", "billing_access_locked"];

  it.each(families)("pushes, emails and keeps %s for an active or Away person", async (type) => {
    await alert(type);
    state.employee = { status: "inactive", suspended_at: null };
    await alert(type);

    expect(inAppInserts).toHaveLength(2);
    expect(sendMobilePushNotifications).toHaveBeenCalledTimes(2);
    expect(sendResendEmail).toHaveBeenCalledTimes(2);
  });

  it.each(families)(
    "keeps %s in the app for a Suspended person, without push or email",
    async (type) => {
      state.employee = { status: "active", suspended_at: "2026-10-28T00:00:00Z" };

      await alert(type);

      expect(inAppInserts).toHaveLength(1);
      expect(sendMobilePushNotifications).not.toHaveBeenCalled();
      expect(sendResendEmail).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Offboarded", () => (state.employee = { status: "removed", suspended_at: null })],
    ["removed from the organization", () => (state.membership = false)],
    [
      "deactivated",
      () =>
        (state.profile = {
          platform_role: "none",
          deactivated_at: "2026-10-01T00:00:00Z",
          terminated_at: null,
        }),
    ],
    [
      "terminated",
      () =>
        (state.profile = {
          platform_role: "none",
          deactivated_at: null,
          terminated_at: "2026-10-01T00:00:00Z",
        }),
    ],
  ])("sends and writes nothing for someone %s", async (_label, apply) => {
    apply();

    for (const type of families) await alert(type);

    expect(inAppInserts).toHaveLength(0);
    expect(sendMobilePushNotifications).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("delivers again once they're reinstated or restored, with nothing to switch back on", async () => {
    state.employee = { status: "active", suspended_at: "2026-10-28T00:00:00Z" };
    await alert("shift_change");
    state.employee = { status: "active", suspended_at: null };
    await alert("shift_change");
    state.employee = { status: "removed", suspended_at: null };
    await alert("shift_change");
    state.employee = { status: "active", suspended_at: null };
    await alert("shift_change");

    expect(sendMobilePushNotifications).toHaveBeenCalledTimes(2);
    expect(sendResendEmail).toHaveBeenCalledTimes(2);
  });

  it("still sends a security alert to a Suspended or Offboarded person's account", async () => {
    state.employee = { status: "removed", suspended_at: "2026-10-28T00:00:00Z" };
    state.membership = false;

    await alert("security_new_device");

    expect(sendMobilePushNotifications).toHaveBeenCalledTimes(1);
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends no security alert to a deactivated account", async () => {
    state.profile = {
      platform_role: "none",
      deactivated_at: "2026-10-01T00:00:00Z",
      terminated_at: null,
    };

    await alert("security_new_device");

    expect(inAppInserts).toHaveLength(0);
    expect(sendMobilePushNotifications).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it("reaches a Gridmaster about an organization they don't belong to", async () => {
    state.profile = { platform_role: "gridmaster", deactivated_at: null, terminated_at: null };
    state.membership = false;
    state.employee = null;

    await alert("shift_change");

    expect(sendMobilePushNotifications).toHaveBeenCalledTimes(1);
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
  });
});
