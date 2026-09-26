// @vitest-environment node
import { createElement, type ComponentType } from "react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@react-email/components";
import { describe, expect, it, vi } from "vitest";
import { AccountDeletedEmail } from "./AccountDeletedEmail";
import { ImpersonationNoticeEmail } from "./ImpersonationNoticeEmail";
import { InviteEmail } from "./InviteEmail";
import { LoginEmailChangedEmail } from "./LoginEmailChangedEmail";
import { NotificationEmail } from "./NotificationEmail";
import { SUPABASE_AUTH_TEMPLATES } from "./auth/supabase-templates";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { sendNotification } from "@/features/notifications/server/sender";

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: vi.fn() }) }));
vi.mock("@/lib/published-shifts", () => ({ fetchPublishedShiftRows: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));
vi.mock("@/features/notifications/server/sender", () => ({ sendNotification: vi.fn() }));

type AppAuthEmail = {
  name: string;
  Component: ComponentType<never>;
  props: Record<string, unknown>;
  /** A notice about something done to the account, which must say what to do if it was not them. */
  notice: boolean;
};

const logoUrl = "https://app.test";

/**
 * Every email the app itself sends about a DubGrid sign-in. The Supabase
 * templates have their own drift check; these are held to the same rules
 * (41c3). Add a new sign-in email here.
 */
const APP_AUTH_EMAILS: AppAuthEmail[] = [
  {
    name: "invitation",
    Component: InviteEmail as ComponentType<never>,
    props: {
      orgName: "Calm Haven",
      acceptUrl: "https://app.test/accept-invite?token=t",
      logoUrl,
      expiresAt: "2026-09-28T22:04:00.000Z",
      timeZone: "America/Los_Angeles",
      kind: "new",
    },
    notice: false,
  },
  {
    name: "reissued invitation",
    Component: InviteEmail as ComponentType<never>,
    props: {
      orgName: "Calm Haven",
      acceptUrl: "https://app.test/accept-invite?token=t",
      logoUrl,
      expiresAt: "2026-09-28T22:04:00.000Z",
      timeZone: "America/Los_Angeles",
      kind: "reissue",
    },
    notice: false,
  },
  {
    name: "sign-in email changed (previous address)",
    Component: LoginEmailChangedEmail as ComponentType<never>,
    props: { orgName: "Calm Haven", recipient: "previous", newEmail: "new@example.com", logoUrl },
    notice: true,
  },
  {
    name: "sign-in email changed (new address)",
    Component: LoginEmailChangedEmail as ComponentType<never>,
    props: { orgName: "Calm Haven", recipient: "new", newEmail: "new@example.com", logoUrl },
    notice: false,
  },
  {
    name: "account deleted",
    Component: AccountDeletedEmail as ComponentType<never>,
    props: { logoUrl },
    notice: true,
  },
  {
    name: "impersonation started",
    Component: ImpersonationNoticeEmail as ComponentType<never>,
    props: {
      orgName: "Calm Haven",
      ended: false,
      expiresAt: "2026-09-28T22:04:00.000Z",
      timeZone: "America/Los_Angeles",
      logoUrl,
    },
    notice: true,
  },
  {
    name: "impersonation ended",
    Component: ImpersonationNoticeEmail as ComponentType<never>,
    props: { orgName: "Calm Haven", ended: true, logoUrl },
    notice: true,
  },
];

/** Emails that are not about a sign-in, and why. */
const NOT_SIGN_IN_EMAILS: Record<string, string> = {
  DemoRequestEmail: "Goes to DubGrid sales, not to an account holder.",
  TrialWelcomeEmail: "A billing welcome, not a sign-in event.",
};

/**
 * The security alerts exactly as the app words them: each event goes through
 * the real dispatcher, and its title and message are rendered in the email.
 */
async function securityAlerts(): Promise<AppAuthEmail[]> {
  const events = [
    {
      action: "security_new_device" as const,
      orgId: "org-1",
      targetUserId: "user-1",
      supabaseSessionId: "session-1",
      platform: "web" as const,
      deviceLabel: "Chrome on macOS",
      ipAddress: null,
      occurredAt: "2026-09-25T10:00:00.000Z",
    },
    {
      action: "security_mfa_changed" as const,
      orgId: "org-1",
      targetUserId: "user-1",
      enabled: true,
    },
    {
      action: "security_mfa_changed" as const,
      orgId: "org-1",
      targetUserId: "user-1",
      enabled: false,
    },
    {
      action: "security_session_revoked" as const,
      orgId: null,
      targetUserId: "user-1",
      initiatedBy: "gridmaster" as const,
    },
  ];
  const alerts: AppAuthEmail[] = [];
  for (const event of events) {
    vi.mocked(sendNotification).mockClear();
    await dispatchNotificationEvent("actor-1", event);
    const call = vi.mocked(sendNotification).mock.calls[0];
    if (!call) throw new Error(`${event.action} sent nothing`);
    const [, , type, title, message, , options] = call;
    const email = options?.email;
    alerts.push({
      name: `${type} (${title})`,
      Component: NotificationEmail as ComponentType<never>,
      props: email
        ? {
            title,
            message: email.intro,
            details: email.details,
            closing: email.closing,
            logoUrl,
            alwaysOn: true,
          }
        : { title, message, logoUrl, alwaysOn: true },
      notice: true,
    });
  }
  return alerts;
}

async function text({ Component, props }: AppAuthEmail): Promise<string> {
  const rendered = await render(createElement(Component, props as never), { plainText: true });
  return rendered.replace(/\s+/g, " ");
}

const templatesDir = path.resolve(process.cwd(), "..", "..", "supabase", "templates");

// Before the tests are collected, so each alert gets every rule below.
APP_AUTH_EMAILS.push(...(await securityAlerts()));

describe("app-sent sign-in emails", () => {
  it("lists every email the app can send, or says why it is not about a sign-in", () => {
    const listed = new Set(
      APP_AUTH_EMAILS.map((email) => (email.Component as { name: string }).name),
    );
    listed.add(NotificationEmail.name);
    const unlisted = readdirSync(path.join(process.cwd(), "src", "emails"))
      .filter((file) => file.endsWith("Email.tsx"))
      .map((file) => file.replace(/\.tsx$/, ""))
      .filter((name) => !listed.has(name) && !NOT_SIGN_IN_EMAILS[name]);

    expect(unlisted).toEqual([]);
  });

  it.each(APP_AUTH_EMAILS)("$name uses no dash or ellipsis characters", async (email) => {
    expect(await text(email)).not.toMatch(/[–—…]/);
  });

  // A DubGrid sign-in belongs to the person, not to an organization, so a
  // credential problem never goes to "your administrator".
  it.each(APP_AUTH_EMAILS)("$name never defers the reader to an administrator", async (email) => {
    expect(await text(email)).not.toMatch(
      /(contact|ask) (your|the) (organization |org )?(administrator|admin)\b/i,
    );
  });

  it.each(APP_AUTH_EMAILS)("$name names nobody who acted", async (email) => {
    expect(await text(email)).not.toMatch(/\b(invited by|on behalf of|has invited you)\b/i);
  });

  it.each(APP_AUTH_EMAILS.filter((email) => email.notice))(
    "$name says what to do if it was not the reader",
    async (email) => {
      const body = await text(email);
      expect(body).toMatch(/(wasn't you|weren't expecting|didn't (ask|expect|request))/i);
      expect(body).toContain("support@dubgrid.com");
    },
  );

  it("security alerts never offer a preference that cannot turn them off", async () => {
    const alerts = APP_AUTH_EMAILS.filter((email) => email.Component === NotificationEmail);
    expect(alerts.length).toBeGreaterThanOrEqual(4);
    for (const alert of alerts) {
      expect(await text(alert)).not.toMatch(/manage your notification preferences/i);
    }
  });
});

describe("Supabase sign-in emails", () => {
  it.each(SUPABASE_AUTH_TEMPLATES)("$key uses no dash or ellipsis characters", ({ key }) => {
    expect(readFileSync(path.join(templatesDir, `${key}.html`), "utf8")).not.toMatch(/[–—…]/);
  });
});
