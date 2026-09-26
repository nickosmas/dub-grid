// @vitest-environment node
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_OTP_LENGTH } from "@dubgrid/domain";
import { diff, readConfig } from "../../../../scripts/push-auth-templates";

const repoRoot = resolve(process.cwd(), "..", "..");

// The script syncs production and had never run in a test (41c1/F-22).
describe("push-auth-templates", () => {
  const config = readConfig(repoRoot);

  it("reads every template and each security notice's enabled flag", () => {
    const notices = config.templates.filter((template) => template.notification);

    expect(config.templates.length).toBe(10);
    expect(notices.map((template) => template.notification)).toEqual([
      { type: "password_changed", enabled: true },
      { type: "email_changed", enabled: true },
      { type: "mfa_factor_enrolled", enabled: true },
      { type: "mfa_factor_unenrolled", enabled: true },
    ]);
    expect(config.templates.every((template) => template.content.includes("<html"))).toBe(true);
    expect(config.otpLength).toBe(EMAIL_OTP_LENGTH);
  });

  it("changes nothing on a project that already matches", () => {
    const live: Record<string, unknown> = {
      mailer_otp_length: config.otpLength,
      mailer_otp_exp: config.otpExpiry,
    };
    for (const { key, subject, content, notification } of config.templates) {
      live[`mailer_templates_${key}_content`] = content;
      live[`mailer_subjects_${key}`] = subject;
      if (notification)
        live[`mailer_notifications_${notification.type}_enabled`] = notification.enabled;
    }

    expect(diff(live, config).changes).toEqual([]);
  });

  it("compares a notice's flag as a boolean, not as text", () => {
    const { changes, payload } = diff(
      { mailer_notifications_password_changed_enabled: "true" },
      config,
    );

    expect(payload.mailer_notifications_password_changed_enabled).toBe(true);
    expect(changes.map((change) => change.field)).toContain(
      "mailer_notifications_password_changed_enabled",
    );
  });

  it("turns on a notice the repository declares on", () => {
    const { payload } = diff({ mailer_notifications_mfa_factor_enrolled_enabled: false }, config);

    expect(payload.mailer_notifications_mfa_factor_enrolled_enabled).toBe(true);
  });
});
