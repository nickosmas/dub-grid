import { getRequestConfig } from "next-intl/server";

/**
 * Server-side request config for next-intl.
 * Single locale (English) — no locale detection or routing needed.
 */
export default getRequestConfig(async () => {
  return {
    locale: "en",
    messages: (await import("../../messages/en.json")).default,
  };
});
