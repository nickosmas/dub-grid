// @vitest-environment node
import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { AccountDeletedEmail } from "./AccountDeletedEmail";

async function text() {
  const rendered = await render(
    createElement(AccountDeletedEmail, { logoUrl: "https://app.test" }),
    {
      plainText: true,
    },
  );
  return rendered.replace(/\s+/g, " ");
}

describe("AccountDeletedEmail", () => {
  it("says the account is gone and signed out everywhere", async () => {
    const body = await text();

    expect(body).toContain("Your DubGrid account was deleted");
    expect(body).toContain("It can no longer sign in");
    expect(body).toContain("support@dubgrid.com");
  });

  // Safe if misaddressed: no actor, no organization, no administrator.
  it("names no person and no organization", async () => {
    const body = await text();

    expect(body).not.toMatch(/administrator|admin\b|organization|approved|requested by/i);
  });
});
