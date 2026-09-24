import { expect, test } from "@playwright/test";
import { waitForClientHydration } from "./helpers/auth";

test.describe("@preflight production login hydration", () => {
  test.setTimeout(30_000);

  test("loads organization login assets over local HTTP and hydrates the form", async ({
    page,
  }) => {
    const response = await page.goto("/login");

    expect(response, "organization login response").not.toBeNull();
    expect(response?.headers()["content-security-policy"]).not.toContain(
      "upgrade-insecure-requests",
    );

    const loginRoot = await waitForClientHydration(page);
    await expect(loginRoot.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });
});
