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
        // react-native-reanimated eagerly evaluates react-native-worklets, whose
        // native bindings throw under jsdom ("Native part of Worklets doesn't
        // seem to be initialized"). Any screen importing it (AppSplashScreen,
        // OnboardingScreen) crashed at module-eval. Route it to the passthrough
        // stub so animated components render as plain RN primitives.
        {
          find: /^react-native-reanimated$/,
          replacement: path.resolve(
            __dirname,
            "./src/test/reanimated-stub.tsx",
          ),
        },
        // Expo native modules eagerly import expo-modules-core + native bindings
        // that vitest can't resolve/run in jsdom. Shim them to test stubs (same
        // approach as the react-native shim above). expo-notifications is
        // type-only in src, so it needs no runtime shim.
        ...["haptics", "constants", "secure-store", "network", "tracking-transparency", "font", "asset"].map(
          (m) => ({
            find: new RegExp(`^expo-${m}$`),
            replacement: path.resolve(__dirname, `./src/test/shims/expo-${m}.ts`),
          }),
        ),
        // Catch-all: any other Expo package (expo-font, expo-asset, ...) pulled
        // transitively imports its native bridge from expo-modules-core. Stub it
        // so those packages load with native calls no-op'd.
        {
          find: /^expo-modules-core$/,
          replacement: path.resolve(__dirname, "./src/test/shims/expo-modules-core.ts"),
        },
        // @expo/vector-icons pulls expo-font -> expo-asset (native font loading);
        // shim the icons to a name-carrying stub. Covers the barrel import and
        // the per-family subpaths (@expo/vector-icons/Ionicons, etc.).
        {
          find: /^@expo\/vector-icons(\/.*)?$/,
          replacement: path.resolve(__dirname, "./src/test/shims/vector-icons.tsx"),
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
