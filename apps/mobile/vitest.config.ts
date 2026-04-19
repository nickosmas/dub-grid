import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vitest/config";
import { sharedVitestConfig } from "../../vitest.shared";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    plugins: [react()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: [
        {
          find: "@dubgrid/contracts",
          replacement: path.resolve(
            __dirname,
            "../../packages/contracts/src/index.ts",
          ),
        },
        {
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
  }),
);
