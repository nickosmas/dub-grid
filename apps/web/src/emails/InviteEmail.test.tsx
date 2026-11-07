// @vitest-environment node
import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { InviteEmail, type InviteEmailProps } from "./InviteEmail";

const base: InviteEmailProps = {
  orgName: "Calm Haven",
  acceptUrl: "https://app.test/accept-invite?token=t",
  logoUrl: "https://app.test",
  expiresAt: "2026-09-28T22:04:00.000Z",
  timeZone: "America/Los_Angeles",
  kind: "new",
};

async function text(overrides: Partial<InviteEmailProps> = {}) {
  const rendered = await render(createElement(InviteEmail, { ...base, ...overrides }), {
    plainText: true,
  });
  return rendered.replace(/\s+/g, " ");
}

describe("InviteEmail", () => {
  it("names the organization and nobody in it", async () => {
    const body = await text();

    expect(body).toContain("You've been invited to join Calm Haven on DubGrid.");
    expect(body).not.toMatch(/has invited you/i);
  });

  it("tells someone with an account there's nothing to set up", async () => {
    const body = await text({ hasAccount: true });

    expect(body).toContain(
      "You already have a DubGrid account with this email address, so there's nothing to set up. Sign in with your password to accept.",
    );
    expect(body).not.toContain("set your password");
  });

  it("states the exact deadline in the organization's zone, and that it is fixed", async () => {
    const body = await text();

    expect(body).toContain(
      "This invitation expires on Monday, September 28, 2026 at 3:04 PM Pacific Daylight Time.",
    );
    expect(body).toContain("72 hours after it was sent, and it doesn't extend");
    expect(body).toContain("only the link in the newest email will work");
  });

  // A reissue kills the earlier link on the spot, so a person holding two
  // emails has to be able to tell which one to use.
  it("says a reissued invitation replaces the earlier one", async () => {
    const body = await text({ kind: "reissue" });

    expect(body).toContain("Here's your new invitation");
    expect(body).toContain(
      "It replaces your earlier one, so the link in that email no longer works.",
    );
    expect(body).toContain("This invitation expires on Monday, September 28, 2026");
    expect(body).not.toMatch(/has invited you/i);
  });

  it("offers to keep one account only after a move", async () => {
    expect(await text({ kind: "moved" })).toContain("we'll keep you on one account");
    expect(await text()).not.toContain("one account");
  });

  it("shows the organization under the logo", async () => {
    expect(await render(createElement(InviteEmail, base))).toMatch(
      /class="dg-ink"[^>]*>Calm Haven</,
    );
  });

  it("keeps its sentences out of cards", async () => {
    const html = await render(
      createElement(InviteEmail, {
        orgName: "Calm Haven",
        acceptUrl: "https://app.test/accept-invite?token=t",
        logoUrl: "https://app.test",
        expiresAt: "2026-09-28T22:04:00.000Z",
        timeZone: "America/Los_Angeles",
        kind: "moved",
      }),
    );

    expect(html).not.toContain('class="dg-card"');
  });

  it("still describes the 72 hours when the deadline is unknown", async () => {
    const body = await text({ expiresAt: null });

    expect(body).toContain("This invitation expires 72 hours after it was sent");
    expect(body).not.toContain("expires on");
  });
});
