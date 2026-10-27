// @vitest-environment node
import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { AccessSuspendedEmail } from "./AccessSuspendedEmail";

async function text() {
  const rendered = await render(
    createElement(AccessSuspendedEmail, {
      logoUrl: "https://app.test",
      organizationName: "Calm Haven",
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

  // Their own state only: no actor, no reason, no schedule.
  it("names nobody and says nothing about their shifts", async () => {
    const body = await text();

    expect(body).not.toMatch(/suspended by|because|shift|schedule/i);
  });
});
