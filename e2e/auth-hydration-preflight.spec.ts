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

  test("loads the pinned product, brand, and monospace fonts on the local origin", async ({
    page,
  }) => {
    await page.goto("/login");
    const faces = await page.evaluate(async () => {
      const descriptors = ["400 16px Inter", '600 16px "DM Sans"', '400 16px "DM Mono"'];
      return Promise.all(
        descriptors.map(async (descriptor) => {
          const loaded = await document.fonts.load(descriptor, "DubGrid");
          return { descriptor, statuses: loaded.map((font) => font.status) };
        }),
      );
    });
    for (const face of faces) {
      expect(face.statuses, face.descriptor).not.toHaveLength(0);
      expect(
        face.statuses.every((status) => status === "loaded"),
        face.descriptor,
      ).toBe(true);
    }
    const preloads = page.locator('link[rel="preload"][as="font"]');
    await expect(preloads).toHaveCount(4);
    for (const href of await preloads.evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    )) {
      expect(new URL(href).origin).toBe(new URL(page.url()).origin);
      const response = await page.request.get(href);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("immutable");
    }
  });
});
