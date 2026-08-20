import { configDefaults, type UserConfig } from "vitest/config";

export const sharedVitestConfig = {
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
    /**
     * Vitest's 5s default is tuned for unit tests, not for the full-screen
     * jsdom renders both suites are mostly made of. Those already run close to
     * it on an idle machine (~3.2s for `EditEmployeePanel`, ~0.9s for
     * ScheduleScreen's month-swipe test), and the margin is spent by worker
     * contention long before anything is actually wrong: the same
     * ScheduleScreen test that takes 0.5s in isolation blew past 5s in a full
     * `npm test` run, failing CI on a machine that was merely busy.
     *
     * 15s keeps a genuine hang failing in a reasonable time while making the
     * timeout a signal about the code rather than about the runner's load.
     */
    testTimeout: 15_000,
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
