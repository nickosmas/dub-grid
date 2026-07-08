import { defineConfig, mergeConfig } from "vitest/config";
import { sharedVitestConfig } from "../../vitest.shared";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      environment: "node",
      // Pin to UTC (production runtime) so schedule date-range normalization is
      // deterministic regardless of the dev machine's timezone.
      env: { TZ: "UTC" },
    },
  }),
);
