import path from "path";
import { defineConfig, mergeConfig } from "vitest/config";
import { sharedVitestConfig } from "../../vitest.shared";

export default defineConfig(async () => {
  const { default: react } = await import("@vitejs/plugin-react");

  return mergeConfig(
    sharedVitestConfig,
    {
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
        {
          find: "jose",
          replacement: path.resolve(
            __dirname,
            "./node_modules/jose/dist/webapi/index.js",
          ),
        },
        {
          find: "next/font/google",
          replacement: path.resolve(
            __dirname,
            "./src/__tests__/__mocks__/next-font.ts",
          ),
        },
        {
          find: "server-only",
          replacement: path.resolve(
            __dirname,
            "./src/__tests__/__mocks__/server-only.ts",
          ),
        },
      ],
    },
    test: {
      environment: "jsdom",
      setupFiles: [path.resolve(__dirname, "./src/__tests__/setup.ts")],
    },
    },
  );
});
