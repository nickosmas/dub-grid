import { configDefaults, type UserConfig } from "vitest/config";

export const sharedVitestConfig = {
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
} satisfies UserConfig;
