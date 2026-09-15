import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const baseURL = `http://calmhaven.${baseDomain}:${port}`;
const isAuthEntryMeasurement = process.env.AUTH_ENTRY_MEASUREMENT === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The Next development server serializes enough work that local parallel
  // navigation can time out before the first page has finished compiling.
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: isAuthEntryMeasurement
          ? `npm --workspace @dubgrid/web run dev -- --port ${port}`
          : "npm run dev:web",
        url: `http://localhost:${port}`,
        reuseExistingServer: !isAuthEntryMeasurement,
        timeout: 120_000,
        env: isAuthEntryMeasurement
          ? {
              ...process.env,
              NEXT_DIST_DIR: ".next-auth-entry",
            }
          : process.env,
      },
});
