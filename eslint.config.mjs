import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "./node_modules/eslint-config-next/node_modules/@next/eslint-plugin-next/dist/index.js";
import reactHooks from "./node_modules/eslint-config-next/node_modules/eslint-plugin-react-hooks/index.js";
import tseslint from "./node_modules/eslint-config-next/node_modules/typescript-eslint/dist/index.js";
import {
  noHtmlTitleAttribute,
  noRawTooltipImport,
} from "./eslint-rules/no-raw-title-tooltip.mjs";

const tooltipPlugin = {
  rules: {
    "no-html-title-attribute": noHtmlTitleAttribute,
    "no-raw-tooltip-import": noRawTooltipImport,
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
    group: [
      "@/features/notifications/server/events",
      "@/features/notifications/server/sender",
    ],
    message: 'Import notification server APIs from "@/features/notifications/server".',
  },
  {
    group: [
      "@/features/permissions/core",
      "@/features/permissions/usePermissions",
    ],
    message: 'Import permission APIs from "@/features/permissions".',
  },
];

const featureLayerPatterns = [
  {
    group: ["@/app/*", "@/components/*", "@/hooks/*"],
    message:
      "Feature modules should depend on feature or lib entrypoints, not app or UI layers.",
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
              group: ["next/*", "expo", "expo-*", "react-native"],
              message:
                "Platform-specific code must stay in app adapters, not shared packages.",
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
    files: [
      "apps/web/src/app/**/*.{ts,tsx}",
      "apps/web/src/components/**/*.{ts,tsx}",
      "apps/web/src/hooks/**/*.{ts,tsx}",
      "apps/mobile/src/**/*.{ts,tsx}",
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
]);

export default eslintConfig;
