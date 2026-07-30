import { configDefaults, type UserConfig } from "vitest/config";

export const sharedVitestConfig = {
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Report-only for now — no `thresholds`. The codebase has no coverage
      // baseline yet, so a guessed number would either fail CI immediately or
      // be meaningless. Run `--coverage` once to capture a baseline, then add
      // real thresholds as a follow-up.
    },
  },
} satisfies UserConfig;
