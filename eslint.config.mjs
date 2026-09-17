import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "./node_modules/eslint-config-next/node_modules/@next/eslint-plugin-next/dist/index.js";
import reactHooks from "./node_modules/eslint-config-next/node_modules/eslint-plugin-react-hooks/index.js";
import tseslint from "./node_modules/eslint-config-next/node_modules/typescript-eslint/dist/index.js";
import eslintConfigPrettier from "eslint-config-prettier";
import { noHtmlTitleAttribute, noRawTooltipImport } from "./eslint-rules/no-raw-title-tooltip.mjs";
import { noDecorativeAiIcons } from "./eslint-rules/no-decorative-ai-icons.mjs";
import { requireBusyButton } from "./eslint-rules/require-busy-button.mjs";
import { noFloatingAsyncHandler } from "./eslint-rules/no-floating-async-handler.mjs";
import { noMisplacedUseClient } from "./eslint-rules/no-misplaced-use-client.mjs";
import { noRawMobileMetrics } from "./eslint-rules/no-raw-mobile-metrics.mjs";
import { noRawErrorInToast, noTechnicalUserCopy } from "./eslint-rules/no-technical-user-copy.mjs";

const tooltipPlugin = {
  rules: {
    "no-html-title-attribute": noHtmlTitleAttribute,
    "no-raw-tooltip-import": noRawTooltipImport,
  },
};

const designPlugin = {
  rules: {
    "no-decorative-ai-icons": noDecorativeAiIcons,
    "require-busy-button": requireBusyButton,
    "no-floating-async-handler": noFloatingAsyncHandler,
    "no-misplaced-use-client": noMisplacedUseClient,
    "no-raw-mobile-metrics": noRawMobileMetrics,
  },
};

const copyPlugin = {
  rules: {
    "no-technical-user-copy": noTechnicalUserCopy,
    "no-raw-error-in-toast": noRawErrorInToast,
  },
};

const webFeaturePublicPaths = [
  {
    name: "@/hooks/usePermissions",
    message: 'Import permissions from "@/features/permissions" instead.',
  },
  {
    name: "@/lib/permissions",
    message: 'Import permissions from "@/features/permissions" instead.',
  },
  {
    name: "@/lib/notifications",
    message: 'Import notification server APIs from "@/features/notifications/server" instead.',
  },
  {
    name: "@/lib/notification-events",
    message: 'Import notification server APIs from "@/features/notifications/server" instead.',
  },
  {
    name: "@/lib/mobile/auth",
    message: 'Import mobile server APIs from "@/features/mobile/server" instead.',
  },
  {
    name: "@/lib/mobile/client",
    message: 'Import mobile server APIs from "@/features/mobile/server" instead.',
  },
  {
    name: "@/lib/mobile/data",
    message: 'Import mobile server APIs from "@/features/mobile/server" instead.',
  },
  {
    name: "@/lib/mobile/push",
    message: 'Import mobile server APIs from "@/features/mobile/server" instead.',
  },
];

const webFeaturePrivatePatterns = [
  {
    group: [
      "@/features/mobile/server/auth",
      "@/features/mobile/server/client",
      "@/features/mobile/server/data",
      "@/features/mobile/server/push",
    ],
    message: 'Import mobile server APIs from "@/features/mobile/server".',
  },
  {
    group: [
      "@/features/mobile/server/routes/bootstrap",
      "@/features/mobile/server/routes/me-schedule",
      "@/features/mobile/server/routes/notifications",
      "@/features/mobile/server/routes/org-schedule",
      "@/features/mobile/server/routes/people",
      "@/features/mobile/server/routes/push-tokens",
      "@/features/mobile/server/routes/shift-request-actions",
      "@/features/mobile/server/routes/shift-requests",
    ],
    message: 'Import mobile route handlers from "@/features/mobile/server/routes".',
  },
  {
    group: ["@/features/notifications/server/events", "@/features/notifications/server/sender"],
    message: 'Import notification server APIs from "@/features/notifications/server".',
  },
  {
    group: ["@/features/permissions/core", "@/features/permissions/usePermissions"],
    message: 'Import permission APIs from "@/features/permissions".',
  },
];

const featureLayerPatterns = [
  {
    group: ["@/app/*", "@/components/*", "@/hooks/*"],
    message: "Feature modules should depend on feature or lib entrypoints, not app or UI layers.",
  },
];

const legacyBrowserSupabaseUiFiles = [];
const nextCoreWebVitals = nextPlugin.configs["core-web-vitals"];

const eslintConfig = defineConfig([
  {
    ...nextCoreWebVitals,
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
  },
  tseslint.configs.base,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "apps/web/.next/**",
    "apps/web/.next-auth-entry/**",
    "out/**",
    "build/**",
    "dist/**",
    "packages/*/dist/**",
    "next-env.d.ts",
    "apps/web/next-env.d.ts",
  ]),
  {
    settings: {
      next: {
        rootDir: ["apps/web/"],
      },
    },
  },
  {
    plugins: { tooltip: tooltipPlugin, "react-hooks": reactHooks },
    rules: {
      "tooltip/no-html-title-attribute": "warn",
      "tooltip/no-raw-tooltip-import": "error",
    },
  },
  {
    // The plugin was registered but no rule from it was ever switched on, so a
    // hook placed below an early return linted clean and only failed at
    // runtime, on the render where the branch flipped. Tests are excluded: a
    // helper there calls a hook directly inside `renderHook`, which is correct
    // there and nowhere else.
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/mobile/src/**/*.{ts,tsx}",
      "apps/mobile/app/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/__tests__/**"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Carries its own `files` on purpose. The Expo Router route files under
    // apps/mobile/app match almost no other block's globs — only this rule set
    // and rules-of-hooks above name them — and one of the sparkles this rule
    // bans lived there. Listing the globs here enforces the rule in routes
    // without switching the full ruleset on for that directory, which is a
    // separate, larger change.
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/mobile/src/**/*.{ts,tsx}",
      "apps/mobile/app/**/*.{ts,tsx}",
      "packages/*/src/**/*.{ts,tsx}",
    ],
    plugins: { design: designPlugin, copy: copyPlugin },
    rules: {
      "design/no-decorative-ai-icons": "error",
      "design/require-busy-button": "error",
      "design/no-floating-async-handler": "error",
      "design/no-misplaced-use-client": "error",
    },
  },
  {
    // Mobile styles draw from the token ramps; the 38d migration cleared the
    // last raw literal, so this is now enforced. The illustration files are
    // drawings, not layout, and the token module is the ramp itself.
    files: ["apps/mobile/src/**/*.{ts,tsx}", "apps/mobile/app/**/*.{ts,tsx}"],
    ignores: [
      "apps/mobile/src/**/*.test.{ts,tsx}",
      "apps/mobile/src/test/**",
      "apps/mobile/src/shared/theme/tokens.ts",
      "apps/mobile/src/features/onboarding/components/illustrations/**",
    ],
    plugins: { design: designPlugin },
    rules: {
      "design/no-raw-mobile-metrics": "error",
    },
  },
  {
    // Keep implementation detail out of the words a customer reads, and keep a
    // caught error from reaching a toast unfiltered. Tests are excluded: their
    // string literals are fixtures standing in for server responses, not copy.
    files: [
      "apps/web/src/**/*.{ts,tsx}",
      "apps/mobile/src/**/*.{ts,tsx}",
      "apps/mobile/app/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/__tests__/**", "**/*.stories.{ts,tsx}"],
    plugins: { copy: copyPlugin },
    rules: {
      "copy/no-technical-user-copy": "error",
      "copy/no-raw-error-in-toast": "error",
    },
  },
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*", "@/app/*", "@/components/*", "@/features/*"],
              message: "Shared packages must not import from app-local aliases.",
            },
            {
              group: ["next/*", "expo", "expo-*", "react-native", "react-dom", "react-dom/*"],
              message: "Platform-specific code must stay in app adapters, not shared packages.",
            },
            {
              group: ["fs", "fs/*", "path", "child_process", "os", "node:*"],
              message: "Node-only APIs must stay in app adapters, not shared packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/app/api/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: webFeaturePublicPaths,
          patterns: webFeaturePrivatePatterns,
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      // The validators themselves: these are what everything else imports, so
      // they are the one place process.env has to be read directly.
      "apps/web/src/lib/env.ts",
      "apps/web/src/lib/env.server.ts",
      "apps/web/src/lib/supabase-keys.ts",
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
      "apps/web/src/**/__tests__/**",
    ],
    rules: {
      // NODE_ENV and NEXT_RUNTIME are deliberately exempt. The bundler inlines
      // them as literals so `if (process.env.NODE_ENV !== "production")` blocks
      // get eliminated; reading them off a validated object instead is a runtime
      // property access the bundler cannot fold, which would ship dev-only code
      // to production. They are build discriminators, not app configuration.
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            'MemberExpression[object.object.name="process"][object.property.name="env"]:not([property.name="NODE_ENV"]):not([property.name="NEXT_RUNTIME"]):not([property.name="npm_package_version"])',
          message:
            'Import validated env vars instead of reading process.env directly: clientEnv from "@/lib/env", or serverEnv from "@/lib/env.server" (server-only — importing it from a client component ships the server schema to the browser).',
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
      "apps/web/src/**/__tests__/**",
    ],
    rules: {
      // Native browser dialogs are unstyled, block the thread, and cannot be
      // themed or tested; every confirmation goes through the in-app dialog.
      "no-restricted-globals": [
        "error",
        ...["alert", "confirm", "prompt"].map((name) => ({
          name,
          message: `Use ConfirmDialog from "@/components/ConfirmDialog" instead of window.${name}().`,
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...["alert", "confirm", "prompt"].map((property) => ({
          object: "window",
          property,
          message: `Use ConfirmDialog from "@/components/ConfirmDialog" instead of window.${property}().`,
        })),
      ],
    },
  },
  {
    files: ["apps/web/src/features/mobile/server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: webFeaturePublicPaths,
          patterns: [...webFeaturePrivatePatterns, ...featureLayerPatterns],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/features/notifications/server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: webFeaturePublicPaths,
          patterns: [...webFeaturePrivatePatterns, ...featureLayerPatterns],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/features/account/server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: webFeaturePublicPaths,
          patterns: [...webFeaturePrivatePatterns, ...featureLayerPatterns],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/features/permissions/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: webFeaturePublicPaths,
          patterns: [...webFeaturePrivatePatterns, ...featureLayerPatterns],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/app/api/**/*.{ts,tsx}", "apps/web/src/features/**/server/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"],
    rules: {
      "no-console": "error",
    },
  },
  {
    files: [
      "apps/web/src/app/**/*.{ts,tsx}",
      "apps/web/src/components/**/*.{ts,tsx}",
      "apps/web/src/hooks/**/*.{ts,tsx}",
      "apps/mobile/src/**/*.{ts,tsx}",
      "apps/mobile/app/**/*.{ts,tsx}",
    ],
    ignores: [
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/app/api/**",
      "apps/web/src/app/**/route.ts",
      "apps/mobile/src/**/*.test.ts",
      "apps/mobile/src/**/*.test.tsx",
      "apps/mobile/src/**/__tests__/**",
      "apps/mobile/src/shared/lib/supabase.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              allowTypeImports: true,
              message:
                "UI layers should use typed app adapters instead of creating raw Supabase clients directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/web/src/app/**/*.{ts,tsx}",
      "apps/web/src/components/**/*.{ts,tsx}",
      "apps/web/src/hooks/**/*.{ts,tsx}",
    ],
    ignores: [
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
      "apps/web/src/**/__tests__/**",
      "apps/web/src/app/api/**",
      ...legacyBrowserSupabaseUiFiles,
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Browser UI should use typed feature/client adapters instead of importing database helpers.",
            },
            {
              name: "@/lib/supabase",
              message:
                "Browser UI should use feature/server adapters instead of importing the raw Supabase browser client.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/db/*"],
              message:
                "Browser UI should use typed feature/client adapters instead of importing database helpers.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
]);

export default eslintConfig;
