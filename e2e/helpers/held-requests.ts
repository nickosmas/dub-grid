import type { Page, Request } from "@playwright/test";

/**
 * Holds requests matching `url` until the returned function is called, so a
 * test can see a loading state before the response lands. A fixed delay raced
 * the page: `goto` waits for the load event, and on a slow runner that came
 * after the delay had run out and the loading state had already gone.
 * Requests `hold` rejects pass straight through.
 */
export async function holdRequests(
  page: Page,
  url: string,
  hold: (request: Request) => boolean = () => true,
): Promise<() => void> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(url, async (route) => {
    if (hold(route.request())) await released;
    // The page may have navigated away while the request was held.
    await route.continue().catch(() => undefined);
  });
  return release;
}
