// @vitest-environment node
import { createElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { InviteEmail } from "./InviteEmail";

describe("InviteEmail", () => {
  it("names the organization and nobody in it", async () => {
    const text = await render(
      createElement(InviteEmail, {
        orgName: "Calm Haven",
        acceptUrl: "https://app.test/accept-invite?token=t",
        logoUrl: "https://app.test",
      }),
      { plainText: true },
    );

    expect(text).toContain("You've been invited to join Calm Haven on DubGrid.");
    expect(text).not.toMatch(/has invited you/i);
  });
});
