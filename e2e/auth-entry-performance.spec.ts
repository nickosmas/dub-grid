import { expect, test, type Browser, type Page, type Response } from "@playwright/test";
import {
  buildAuthEntrySample,
  classifyAuthEntryRequest,
  summarizeAuthEntrySamples,
  type AuthEntryJourney,
  type AuthEntryRequestKind,
  type AuthEntryRequestObservation,
  type AuthEntrySample,
} from "../apps/web/src/lib/auth-entry-measurement";
import {
  loginAsQaSuperAdmin,
  QA_SUPER_ADMIN_EMAIL,
  QA_SUPER_ADMIN_PASSWORD,
  waitForClientHydration,
} from "./helpers/auth";

const SAMPLE_COUNT = parseSampleCount(process.env.AUTH_ENTRY_SAMPLES);

test("measures cold and warm web authentication entry", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(5 * 60_000);
  expect(baseURL, "Playwright baseURL is required").toBeTruthy();
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname.startsWith("calmhaven.")).toBe(true);

  await prepareMeasurementAccount(browser, origin);

  const samples: AuthEntrySample[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const context = await browser.newContext({ baseURL: origin });
    const page = await context.newPage();

    await page.goto("/login");
    await waitForClientHydration(page);
    await page.getByLabel("Email").fill(QA_SUPER_ADMIN_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(QA_SUPER_ADMIN_PASSWORD);

    samples.push(await measureJourney(page, "cold_sign_in", () => signIn(page)));
    samples.push(await measureJourney(page, "warm_refresh", () => page.reload()));

    await context.close();
  }

  const report = summarizeAuthEntrySamples(samples);
  const serializedReport = JSON.stringify(report, null, 2);
  console.log(`AUTH_ENTRY_BASELINE\n${serializedReport}`);
  await testInfo.attach("auth-entry-baseline.json", {
    body: serializedReport,
    contentType: "application/json",
  });

  expect(report.journeys.cold_sign_in.samples).toBe(SAMPLE_COUNT);
  expect(report.journeys.warm_refresh.samples).toBe(SAMPLE_COUNT);
  expect(report.journeys.cold_sign_in.requestCounts.login?.max).toBe(1);
  expect(report.journeys.cold_sign_in.requestCounts.session_tracking?.max).toBe(1);
  expect(report.journeys.cold_sign_in.requestCounts.organization_bootstrap?.max).toBeGreaterThan(0);
  expect(report.journeys.warm_refresh.requestCounts.login).toBeUndefined();
  expect(report.journeys.warm_refresh.requestCounts.session_tracking?.max).toBe(1);
  expect(report.journeys.warm_refresh.requestCounts.organization_bootstrap?.max).toBeGreaterThan(0);
});

async function prepareMeasurementAccount(browser: Browser, origin: string): Promise<void> {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  await loginAsQaSuperAdmin(page, origin);
  await context.close();
}

async function signIn(page: Page): Promise<Response | null> {
  await page.getByRole("button", { name: "Sign In" }).click();
  return null;
}

async function measureJourney(
  page: Page,
  journey: AuthEntryJourney,
  action: () => Promise<unknown>,
): Promise<AuthEntrySample> {
  const recorder = createRequestRecorder(page);
  const startedAt = performance.now();
  await action();
  await Promise.all([
    expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible({ timeout: 30_000 }),
    recorder.waitFor("organization_bootstrap"),
  ]);
  const durationMs = performance.now() - startedAt;

  await page.waitForTimeout(250);
  const observations = await recorder.stop();
  return buildAuthEntrySample(journey, durationMs, observations);
}

function createRequestRecorder(page: Page): {
  waitFor: (kind: AuthEntryRequestKind) => Promise<void>;
  stop: () => Promise<AuthEntryRequestObservation[]>;
} {
  const observations: AuthEntryRequestObservation[] = [];
  const pending = new Set<Promise<void>>();
  const waiters = new Map<AuthEntryRequestKind, Set<() => void>>();

  const onResponse = (response: Response) => {
    const request = response.request();
    const kind = classifyAuthEntryRequest(response.url(), request.resourceType());
    if (!kind) return;

    const capture = response
      .headerValue("server-timing")
      .then((serverTiming) => {
        observations.push({ kind, serverTiming });
        for (const resolve of waiters.get(kind) ?? []) resolve();
        waiters.delete(kind);
      })
      .finally(() => pending.delete(capture));
    pending.add(capture);
  };

  page.on("response", onResponse);

  return {
    waitFor: (kind) => {
      if (observations.some((observation) => observation.kind === kind)) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${kind}`)),
          30_000,
        );
        const resolveOnce = () => {
          clearTimeout(timeout);
          resolve();
        };
        const existing = waiters.get(kind) ?? new Set();
        existing.add(resolveOnce);
        waiters.set(kind, existing);
      });
    },
    stop: async () => {
      page.off("response", onResponse);
      await Promise.allSettled([...pending]);
      return observations;
    },
  };
}

function parseSampleCount(rawValue: string | undefined): number {
  if (!rawValue) return 3;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
    throw new Error("AUTH_ENTRY_SAMPLES must be an integer from 1 through 5");
  }
  return parsed;
}
