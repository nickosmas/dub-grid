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
};

type Op = [string, ...unknown[]];

function has(ops: Op[], ...op: unknown[]) {
  return ops.some((entry) => op.every((value, index) => entry[index] === value));
}

function resolve(table: string, ops: Op[]) {
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
  for (const name of ["select", "eq", "neq", "gte", "limit", "insert"]) {
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
    sendResendEmail.mockResolvedValue({ id: "email-1" });
    pushEligible.mockReturnValue(false);
  });

  // Ten unrelated emails in an hour used to suppress a sign-in warning.
  it("still sends a security alert after a burst of ordinary mail", async () => {
    state.otherEmailsThisHour = 10;

    await send("security_new_device");

    expect(sendResendEmail).toHaveBeenCalledTimes(1);
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
