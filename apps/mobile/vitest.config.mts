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
      dedupe: ["react", "react-dom"],
      alias: [
        {
          // Keep Vitest on a single React/ReactDOM pair for the jsdom renderer.
          // Pointing at apps/mobile/node_modules caused duplicate-runtime hook failures
          // with the current Expo + Testing Library stack.
          find: /^react$/,
          replacement: path.resolve(
            __dirname,
            "../../node_modules/react/index.js",
          ),
        },
        {
          find: /^react-dom$/,
          replacement: path.resolve(
            __dirname,
            "../../node_modules/react-dom/index.js",
          ),
        },
        {
          find: /^react-dom\/client$/,
          replacement: path.resolve(
            __dirname,
            "../../node_modules/react-dom/client.js",
          ),
        },
        {
          find: /^react\/jsx-runtime$/,
          replacement: path.resolve(
            __dirname,
            "../../node_modules/react/jsx-runtime.js",
          ),
        },
        {
          find: /^react\/jsx-dev-runtime$/,
          replacement: path.resolve(
            __dirname,
            "../../node_modules/react/jsx-dev-runtime.js",
          ),
        },
        {
          find: /^react-native$/,
          replacement: path.resolve(
            __dirname,
            "./src/test/react-native-shim.ts",
          ),
        },
      ],
    },
    test: {
      environment: "jsdom",
      setupFiles: [path.resolve(__dirname, "./src/test/setup.ts")],
    },
    },
  );
});
