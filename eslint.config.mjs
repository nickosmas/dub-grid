import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "apps/web/.next/**",
    "out/**",
    "build/**",
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
    plugins: { tooltip: tooltipPlugin },
    rules: {
      "tooltip/no-html-title-attribute": "warn",
      "tooltip/no-raw-tooltip-import": "error",
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
]);

export default eslintConfig;
