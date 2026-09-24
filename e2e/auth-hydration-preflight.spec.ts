import { expect, test } from "@playwright/test";
import { waitForClientHydration } from "./helpers/auth";

test.describe("@preflight production login hydration", () => {
  test.setTimeout(30_000);

  test("preserves cross-subdomain redirects to the public apex", async ({ request, baseURL }) => {
    const source = new URL(baseURL!);
    const apex = new URL(source);
    apex.hostname = source.hostname.replace(/^calmhaven\./, "");

    // Exercise the real Next server: mocked proxy responses cannot catch its
    // conversion of an absolute localhost redirect into a relative self-loop.
    for (const subdomain of ["calmhaven", "gridmaster"]) {
      source.hostname = `${subdomain}.${apex.hostname}`;
      for (const path of ["/", "/privacy", "/terms", "/request-demo"]) {
        const response = await request.get(new URL(path, source).href, { maxRedirects: 0 });
        expect(response.status()).toBe(307);
        expect(response.headers().location).toBe(new URL(path, apex).href);
      }
    }
  });

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
