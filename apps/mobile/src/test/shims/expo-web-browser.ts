// Test shim for expo-web-browser — the real package needs a native browser
// binding. Records what would have been opened so policy links are assertable,
// and resolves as a dismissal (what a user closing the tab produces).
export const openedUrls: Array<{ url: string; options?: Record<string, unknown> }> = [];

export async function openBrowserAsync(
  url: string,
  options?: Record<string, unknown>,
): Promise<{ type: "dismiss" }> {
  openedUrls.push({ url, options });
  return { type: "dismiss" };
}
