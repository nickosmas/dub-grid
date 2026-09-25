import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "..", "..");
const apiRoot = path.join(repoRoot, "apps", "web", "src", "app", "api");
const mobileRoutesRoot = path.join(
  repoRoot,
  "apps",
  "web",
  "src",
  "features",
  "mobile",
  "server",
  "routes",
);

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
  // The password check itself: it ends only the Auth session its own
  // password just created, when that sign-in is then refused (41c2).
  "apps/web/src/app/api/auth/login/route.ts": {
    policy: "independent-credential",
    assertions: [
      /\bvalidateCsrfOrigin\s*\(/,
      /checkRateLimit\(loginLimiter/,
      /const sessionId = typeof claims\.session_id === "string" \? claims\.session_id : null;/,
      /async function refuseSignIn[\s\S]*?await endUserSession\(input\.userId, input\.sessionId\)/,
      /refuseSignIn\(\{\s*userId: data\.user\.id,\s*sessionId,/,
    ],
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
  "apps/web/src/app/api/gridmaster/accounts/route.ts": {
    policy: "sensitive",
    assertions: [
      /export async function POST[\s\S]*?\brequireGridmasterSession\s*\([\s\S]*?\brequireSensitiveActionAuth\s*\([\s\S]*?\.rpc\("promote_gridmaster_by_email"[\s\S]*?\.rpc\("demote_gridmaster_account"[\s\S]*?\.rpc\("set_gridmaster_account_deactivated"/,
    ],
  },
  "apps/web/src/app/api/gridmaster/audit-log/export/route.ts": {
    policy: "sensitive",
    assertions: [
      /\brequireGridmasterSession\s*\([\s\S]*?const assurance = await requireSensitiveActionAuth\(req\);\s*if \("response" in assurance\) \{\s*return assurance\.response;[\s\S]*?\bfetchFilteredAuditRows\s*\(/,
    ],
  },
  "apps/web/src/app/api/gridmaster/organizations/manage/route.ts": {
    policy: "conditional-sensitive",
    assertions: [
      /parsed\.data\.action === "assignOrgRoleByEmail"\) \{\s*const assurance = await requireSensitiveActionAuth\(req\);\s*if \("response" in assurance\) \{\s*return assurance\.response;[\s\S]*?\.rpc\("assign_org_role_by_email"/,
    ],
  },
  "apps/web/src/app/api/gridmaster/password-reset/route.ts": {
    policy: "sensitive",
    assertions: [
      /\brequireGridmasterSession\s*\([\s\S]*?\brequireSensitiveActionAuth\s*\([\s\S]*?\.resetPasswordForEmail\(/,
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
      /roleChanged && allowed\.isGridmaster\) \{\s*const assurance = await requireSensitiveActionAuth\(req\);\s*if \("response" in assurance\) return assurance\.response;[\s\S]*?\.rpc\("change_user_role"/,
    ],
  },
  "apps/web/src/app/api/organizations/role-change/route.ts": {
    policy: "sensitive",
    assertions: [
      /const assurance = await requireSensitiveActionAuth\(req\);\s*if \("response" in assurance\) return assurance\.response;[\s\S]*?\.rpc\("change_user_role"/,
    ],
  },
  "apps/web/src/app/api/organizations/delete/route.ts": {
    policy: "sensitive",
    assertions: [/\brequireOrgPermissions\s*\(/, /\brequireSensitiveActionAuth\s*\(/],
  },
  "apps/web/src/app/api/employees/manage/route.ts": {
    policy: "conditional-sensitive",
    assertions: [
      /if \(loginEmailChange && linkedUserId\) \{[\s\S]*?\bforbidIfSandboxCookie\s*\([\s\S]*?\brequireSensitiveActionAuth\s*\([\s\S]*?\bsyncLinkedLoginEmail\s*\([\s\S]*?\bfollowUpLinkedLoginEmailChange\s*\(/,
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
    /if \(loginEmailChange && currentPerson\.userId\) \{[\s\S]*?\brequireMobileSensitiveActionAuth\s*\([\s\S]*?\bsyncLinkedLoginEmail\s*\([\s\S]*?\bfollowUpLinkedLoginEmailChange\s*\(/,
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
  // Approving an account deletion ends a sign-in, so the approval needs proof.
  "apps/web/src/features/mobile/server/routes/profile-change-requests.ts": [
    /pending\.type === "account_deletion"[\s\S]*?if \(parsed\.data\.action === "approve"\) \{\s*const assurance = await requireMobileSensitiveActionAuth\(req\);\s*if \("response" in assurance\) return assurance\.response;/,
  ],
  "apps/web/src/features/mobile/server/routes/profile-sessions.ts": [
    /export async function DELETE[\s\S]*?\brequireMobileSensitiveActionAuth\s*\(/,
  ],
};

// Also catches a file by what it changes, not only by the gate it calls, so a
// credential or authority change without a gate is found rather than missed:
// password-reset sends, Gridmaster role changes, provider-session endings and
// the account-deletion and sign-in-email helpers (41b3). It reads route files
// and mobile handlers only, so a new helper that makes such a change belongs
// in this list.
const sensitiveSourceMarker =
  /\b(?:requireSensitiveActionAuth|requireMobileSensitiveActionAuth|revokeAllUserSessions|revokeOtherUserSessions|revokeUserSessionForUser|endUserSessions?|resetPasswordForEmail|deleteUserAccountWithCleanup|syncLinkedLoginEmail)\s*\(|auth\.admin\.(?:createUser|updateUserById|deleteUser|signOut)\s*\(|gdpr_erase_user_data|force_logout_user|promote_gridmaster_by_email|demote_gridmaster_account|set_gridmaster_account_deactivated|assign_org_role_by_email|change_user_role/;
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

  it("classifies every mobile handler that makes such a change", () => {
    const handlers = readdirSync(mobileRoutesRoot)
      .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
      .map((entry) => relativePath(path.join(mobileRoutesRoot, entry)))
      .filter((filePath) =>
        sensitiveSourceMarker.test(readFileSync(path.join(repoRoot, filePath), "utf8")),
      )
      .sort();

    expect(handlers).toEqual(Object.keys(MOBILE_DELEGATES).sort());
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
