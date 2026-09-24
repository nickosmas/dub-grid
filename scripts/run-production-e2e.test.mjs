import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createInterruptGuard, resolveProductionE2EConfig } from "./run-production-e2e.mjs";

const dedicatedCredentials = {
  E2E_UPSTASH_REDIS_REST_URL: "https://e2e-only.upstash.io",
  E2E_UPSTASH_REDIS_REST_TOKEN: "e2e-only-token",
};

test("production E2E requires dedicated Redis credentials instead of production fallbacks", () => {
  assert.throws(
    () =>
      resolveProductionE2EConfig({
        UPSTASH_REDIS_REST_URL: "https://production.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "production-token",
      }),
    /E2E_UPSTASH_REDIS_REST_URL and E2E_UPSTASH_REDIS_REST_TOKEN are required/,
  );
});

test("production E2E defaults to an isolated port and calibrated live limiter", () => {
  assert.deepEqual(resolveProductionE2EConfig(dedicatedCredentials), {
    port: 3002,
    redisUrl: "https://e2e-only.upstash.io",
    redisToken: "e2e-only-token",
    loginEmailLimit: 200,
  });
});

test("production E2E selects E2E credentials when production credentials are also present", () => {
  const config = resolveProductionE2EConfig({
    ...dedicatedCredentials,
    UPSTASH_REDIS_REST_URL: "https://production.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "production-token",
  });

  assert.equal(config.redisUrl, dedicatedCredentials.E2E_UPSTASH_REDIS_REST_URL);
  assert.equal(config.redisToken, dedicatedCredentials.E2E_UPSTASH_REDIS_REST_TOKEN);
});

test("production E2E never accepts the regular development port", () => {
  assert.throws(
    () => resolveProductionE2EConfig({ ...dedicatedCredentials, E2E_PRODUCTION_PORT: "3000" }),
    /other than 3000/,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`production E2E turns ${signal} into a cleanup-triggering rejection`, async () => {
    const runtime = new EventEmitter();
    let stoppedActiveChild = 0;
    const interrupts = createInterruptGuard(runtime, () => {
      stoppedActiveChild += 1;
    });

    const pending = interrupts.waitFor(new Promise(() => {}));
    runtime.emit(signal);

    await assert.rejects(pending, new RegExp(`received ${signal}`));
    assert.equal(stoppedActiveChild, 1);

    interrupts.dispose();
    assert.equal(runtime.listenerCount("SIGINT"), 0);
    assert.equal(runtime.listenerCount("SIGTERM"), 0);
  });
}
