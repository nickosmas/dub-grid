import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vitest/config";
import { sharedVitestConfig } from "../../vitest.shared";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
        {
          find: "@dubgrid/contracts",
          replacement: path.resolve(
            __dirname,
            "../../packages/contracts/src/index.ts",
          ),
        },
        {
          find: "next/font/google",
          replacement: path.resolve(
            __dirname,
            "./src/__tests__/__mocks__/next-font.ts",
          ),
        },
      ],
    },
    test: {
      environment: "jsdom",
      setupFiles: [path.resolve(__dirname, "./src/__tests__/setup.ts")],
    },
  }),
);
