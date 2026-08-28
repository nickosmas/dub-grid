import { createRequire } from "node:module";
import path from "path";
import { defineConfig, mergeConfig } from "vitest/config";

const require = createRequire(import.meta.url);

// jose ships both a node and a webapi build; under jsdom we want the webapi
// one, so we alias straight at the file rather than let vite pick a condition.
// Resolve it rather than hardcoding `./node_modules/jose/...` — that path only
// exists when npm nests dependencies per-workspace, so it broke the moment the
// tree was hoisted. `jose/package.json` is exported, the dist files are not.
const joseWebApi = path.join(
  path.dirname(require.resolve("jose/package.json")),
  "dist/webapi/index.js",
);
import { sharedVitestConfig } from "../../vitest.shared";

export default defineConfig(async () => {
  const { default: react } = await import("@vitejs/plugin-react");

  return mergeConfig(sharedVitestConfig, {
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
        {
          find: "jose",
          replacement: joseWebApi,
        },
        {
          find: "next/font/google",
          replacement: path.resolve(__dirname, "./src/__tests__/__mocks__/next-font.ts"),
        },
        {
          find: "server-only",
          replacement: path.resolve(__dirname, "./src/__tests__/__mocks__/server-only.ts"),
        },
      ],
    },
    test: {
      environment: "jsdom",
      setupFiles: [path.resolve(__dirname, "./src/__tests__/setup.ts")],
      // The suite includes local Supabase integration tests and expensive
      // property-based UI tests. Running them alongside the full UI suite
      // exhausts local resources and causes false timeout failures.
      minWorkers: 1,
      maxWorkers: 1,
    },
  });
});
