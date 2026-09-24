import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const apiRoot = path.join(repoRoot, "apps", "web", "src", "app", "api");

type Boundary = {
  policy:
    | "sensitive"
    | "conditional-sensitive"
    | "authorized-target-revocation"
    | "independent-credential"
    | "delegated";
  assertions: RegExp[];
};

/**
 * Every credential, factor, session-changing, export, and destructive account
 * or organization API entry point is named here. Adding a matching endpoint
 * without classifying its assurance boundary makes this test fail.
 */
const SENSITIVE_ENTRY_POINTS: Record<string, Boundary> = {
  "apps/web/src/app/api/account/credential-assurance/route.ts": {
    policy: "sensitive",
    assertions: [/\brequireSensitiveActionAuth\s*\(/],
  },
  "apps/web/src/app/api/account/mfa-lifecycle/route.ts": {
    policy: "delegated",
    assertions: [/sensitiveAuth:\s*adapt\(requireSensitiveActionAuth\)/],
  },
  "apps/web/src/app/api/account/sessions/route.ts": {
    policy: "sensitive",
    assertions: [/export async function DELETE[\s\S]*?\brequireSensitiveActionAuth\s*\(/],
  },
  "apps/web/src/app/api/auth/data-export/route.ts": {
    policy: "sensitive",
    assertions: [/\brequireSensitiveActionAuth\s*\(/],
  },
  "apps/web/src/app/api/auth/delete-account/route.ts": {
    policy: "sensitive",
    assertions: [/\brequireSensitiveActionAuth\s*\(/],
  },
  "apps/web/src/app/api/auth/gdpr-erase/route.ts": {
    policy: "sensitive",
    assertions: [/\brequireSensitiveActionAuth\s*\(/],
  },
  "apps/web/src/app/api/auth/sign-out/route.ts": {
    policy: "conditional-sensitive",
    assertions: [
      /if \(scope !== "local"\)[\s\S]*?\brequireSensitiveActionAuth\s*\(/,
      /recoveryCompletion && !hasFreshRecoveryProof\(auth\.claims\)[\s\S]*?\brevokeBulkSessions\s*\(/,
    ],
  },
  "apps/web/src/app/api/employees/status/route.ts": {
    policy: "authorized-target-revocation",
    assertions: [
      /\brequireAuthenticatedUser\s*\(/,
      /\bcanManageEmployees\s*\(/,
      /action === "remove" \|\| action === "deactivate"[\s\S]*?revokeAllUserSessions/,
    ],
  },
  "apps/web/src/app/api/gridmaster/users/[userId]/force-logout/route.ts": {
    policy: "sensitive",
    assertions: [
      /\brequireGridmasterSession\s*\(/,
      /\brequireSensitiveActionAuth\s*\(/,
      /force_logout_user/,
    ],
  },
  "apps/web/src/app/api/gridmaster/users/[userId]/terminate/route.ts": {
    policy: "sensitive",
    assertions: [
      /\brequireGridmasterSession\s*\(/,
      /\brequireSensitiveActionAuth\s*\(/,
      /terminate_user_account/,
      /revokeAllUserSessions\(userId\)/,
    ],
  },
  "apps/web/src/app/api/gridmaster/users/[userId]/reinstate/route.ts": {
    policy: "sensitive",
    assertions: [
      /\brequireGridmasterSession\s*\(/,
      /\brequireSensitiveActionAuth\s*\(/,
      /reinstate_user_account/,
    ],
  },
  "apps/web/src/app/api/gridmaster/users/route.ts": {
    // Deactivation is reversible and already gated on a live gridmaster
    // profile; it revokes the target's issued tokens the moment it lands.
    policy: "authorized-target-revocation",
    assertions: [
      /\brequireGridmasterSession\s*\(/,
      /if \(deactivate\) \{[\s\S]*?revokeAllUserSessions\(userId\)/,
    ],
  },
  "apps/web/src/app/api/invitations/register/route.ts": {
    policy: "independent-credential",
    assertions: [
      /\bvalidateCsrfOrigin\s*\(/,
      /checkRateLimit\(apiLimiter/,
      /checkRateLimit\(emailTargetLimiter/,
      /\.eq\("token", token\)[\s\S]*?\.gt\("expires_at"[\s\S]*?\.is\("accepted_at", null\)[\s\S]*?\.is\("revoked_at", null\)/,
      /if \(invitedEmail !== email\)/,
    ],
  },
  "apps/web/src/app/api/mobile/v1/auth/sign-out/route.ts": {
    policy: "delegated",
    assertions: [/export \{ POST \} from "@\/features\/mobile\/server\/routes\/auth-sign-out"/],
  },
  "apps/web/src/app/api/mobile/v1/profile/credential-assurance/route.ts": {
    policy: "delegated",
    assertions: [
      /export \{ POST \} from "@\/features\/mobile\/server\/routes\/credential-assurance"/,
    ],
  },
  "apps/web/src/app/api/mobile/v1/profile/mfa-lifecycle/route.ts": {
    policy: "delegated",
    assertions: [/export \{ POST \} from "@\/features\/mobile\/server\/routes\/mfa-lifecycle"/],
  },
  "apps/web/src/app/api/mobile/v1/profile/sessions/route.ts": {
    policy: "delegated",
    assertions: [
      /export \{ DELETE, GET \} from "@\/features\/mobile\/server\/routes\/profile-sessions"/,
    ],
  },
  "apps/web/src/app/api/organizations/access/route.ts": {
    policy: "authorized-target-revocation",
    assertions: [
      /export async function DELETE[\s\S]*?\brequirePrivilegedActor\s*\(/,
      /export async function DELETE[\s\S]*?revokeAllUserSessions/,
    ],
  },
  "apps/web/src/app/api/organizations/delete/route.ts": {
    policy: "sensitive",
    assertions: [/\brequireOrgPermissions\s*\(/, /\brequireSensitiveActionAuth\s*\(/],
  },
  "apps/web/src/app/api/employees/manage/route.ts": {
    policy: "conditional-sensitive",
    assertions: [
      /if \(loginEmailChange && linkedUserId\) \{[\s\S]*?\bforbidIfSandboxCookie\s*\([\s\S]*?\brequireSensitiveActionAuth\s*\([\s\S]*?\bsyncLinkedLoginEmail\s*\(/,
    ],
  },
  "apps/web/src/app/api/people/change-requests/[id]/route.ts": {
    policy: "conditional-sensitive",
    assertions: [
      /parsed\.data\.action === "approve" && pendingRequest\.type === "account_deletion"[\s\S]*?\brequireSensitiveActionAuth\s*\(/,
    ],
  },
};

const MOBILE_DELEGATES: Record<string, RegExp[]> = {
  "apps/web/src/features/mobile/server/routes/person.ts": [
    /if \(loginEmailChange && currentPerson\.userId\) \{[\s\S]*?\brequireMobileSensitiveActionAuth\s*\([\s\S]*?\bsyncLinkedLoginEmail\s*\(/,
  ],
  "apps/web/src/features/mobile/server/routes/auth-sign-out.ts": [
    /requireAssuredCaller[\s\S]*?\brequireMobileSensitiveActionAuth\s*\(/,
    /recoveryCompletion\s*\?\s*await requireRecoveryCaller\(req\)\s*:\s*await requireAssuredCaller\(req\)/,
    /!hasFreshRecoveryProof\(verified\.claims\)/,
  ],
  "apps/web/src/features/mobile/server/routes/credential-assurance.ts": [
    /\brequireMobileSensitiveActionAuth\s*\(/,
  ],
  "apps/web/src/features/mobile/server/routes/mfa-lifecycle.ts": [
    /sensitiveAuth:\s*\(req\) => requireMobileSensitiveActionAuth\(req\)/,
  ],
  "apps/web/src/features/mobile/server/routes/profile-sessions.ts": [
    /export async function DELETE[\s\S]*?\brequireMobileSensitiveActionAuth\s*\(/,
  ],
};

const sensitiveSourceMarker =
  /\b(?:requireSensitiveActionAuth|requireMobileSensitiveActionAuth|revokeAllUserSessions|revokeOtherUserSessions|revokeUserSessionForUser)\s*\(|auth\.admin\.(?:createUser|updateUserById|deleteUser|signOut)\s*\(|gdpr_erase_user_data|force_logout_user/;
const delegatedSensitivePath =
  /\/(?:(?:account|mobile\/v1\/profile)\/(?:credential-assurance|mfa-lifecycle|sessions)|mobile\/v1\/auth\/sign-out)\/route\.ts$/;

function collectRouteHandlers(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    if (statSync(entryPath).isDirectory()) files.push(...collectRouteHandlers(entryPath));
    else if (entry === "route.ts") files.push(entryPath);
  }
  return files;
}

function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

describe("sensitive action authorization boundaries", () => {
  const candidates = collectRouteHandlers(apiRoot)
    .map(relativePath)
    .filter((filePath) => {
      const source = readFileSync(path.join(repoRoot, filePath), "utf8");
      return sensitiveSourceMarker.test(source) || delegatedSensitivePath.test(filePath);
    })
    .sort();

  it("classifies every credential, factor, session-changing, export, or destructive entry point", () => {
    expect(candidates).toEqual(Object.keys(SENSITIVE_ENTRY_POINTS).sort());
  });

  it("keeps every classified entry point behind its declared policy", () => {
    const failures = Object.entries(SENSITIVE_ENTRY_POINTS).flatMap(([filePath, boundary]) => {
      const source = readFileSync(path.join(repoRoot, filePath), "utf8");
      return boundary.assertions
        .filter((assertion) => !assertion.test(source))
        .map((assertion) => ({ filePath, policy: boundary.policy, assertion: assertion.source }));
    });

    expect(failures).toEqual([]);
  });

  it("keeps mobile re-exports delegated to handlers with equivalent assurance", () => {
    const failures = Object.entries(MOBILE_DELEGATES).flatMap(([filePath, assertions]) => {
      const source = readFileSync(path.join(repoRoot, filePath), "utf8");
      return assertions
        .filter((assertion) => !assertion.test(source))
        .map((assertion) => ({ filePath, assertion: assertion.source }));
    });

    expect(failures).toEqual([]);
  });
});
