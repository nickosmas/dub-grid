// @vitest-environment node
import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { AccessSuspendedEmail } from "./AccessSuspendedEmail";

async function text(suspendedUntil: string | null = null) {
  const rendered = await render(
    createElement(AccessSuspendedEmail, {
      logoUrl: "https://app.test",
      organizationName: "Calm Haven",
      suspendedUntil,
    }),
    { plainText: true },
  );
  return rendered.replace(/\s+/g, " ");
}

describe("AccessSuspendedEmail", () => {
  it("says they can't sign in and who to ask", async () => {
    const body = await text();

    expect(body).toContain("Your access to Calm Haven is suspended");
    expect(body).toContain("You can't sign in to Calm Haven right now.");
    expect(body).toContain("contact your administrator");
  });

  it("names the day they get access back when the suspension has an end", async () => {
    expect(await text("2026-11-20")).toContain(
      "You can't sign in to Calm Haven until Fri, Nov 20.",
    );
  });

  // Their own state only: no actor, no reason, no schedule.
  it("names nobody and says nothing about their shifts", async () => {
    const body = await text();

    expect(body).not.toMatch(/suspended by|because|shift|schedule/i);
  });
});
