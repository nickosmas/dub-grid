// @vitest-environment node
import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import {
  ImpersonationNoticeEmail,
  impersonationNoticeSubject,
  type ImpersonationNoticeEmailProps,
} from "./ImpersonationNoticeEmail";

const base: ImpersonationNoticeEmailProps = {
  orgName: "Calm Haven",
  ended: false,
  expiresAt: "2026-09-28T22:04:00.000Z",
  timeZone: "America/Los_Angeles",
  logoUrl: "https://app.test",
};

async function text(overrides: Partial<ImpersonationNoticeEmailProps> = {}) {
  const rendered = await render(
    createElement(ImpersonationNoticeEmail, { ...base, ...overrides }),
    {
      plainText: true,
    },
  );
  return rendered.replace(/\s+/g, " ");
}

describe("ImpersonationNoticeEmail", () => {
  it("says support is using the account, where, and until when", async () => {
    const body = await text();

    expect(body).toContain("DubGrid support is using your account in Calm Haven");
    expect(body).toContain("This access ends by Monday, September 28, 2026 at 3:04 PM");
    expect(body).toContain("If you weren't expecting this, contact support@dubgrid.com.");
  });

  it("says when the access ended, without a deadline", async () => {
    const body = await text({ ended: true });

    expect(body).toContain("DubGrid support is no longer using your account in Calm Haven.");
    expect(body).not.toContain("ends by");
  });

  // Safe if misaddressed: no person, no free-text reason, no administrator.
  it("names no one and never sends the reader to an administrator", async () => {
    for (const ended of [false, true]) {
      const body = await text({ ended });
      expect(body).not.toMatch(/administrator|admin\b|reason|reviewing/i);
      expect(body).not.toMatch(/[–—…]/);
    }
  });

  it("subjects name the organization when known", () => {
    expect(impersonationNoticeSubject(false, "Calm Haven")).toBe(
      "DubGrid support is using your account in Calm Haven",
    );
    expect(impersonationNoticeSubject(true)).toBe("DubGrid support has left your account");
  });
});
