export type PublicIdentityOperation = {
  source: string;
  disclosure: "generic" | "capability" | "intentional-discovery";
  limits: readonly ("source" | "target" | "surge" | "provider")[];
  reason: string;
};

export const PUBLIC_IDENTITY_OPERATIONS = {
  webLogin: {
    source: "apps/web/src/app/api/auth/login/route.ts",
    disclosure: "generic",
    limits: ["source", "target", "surge"],
    reason: "Password rejection must not confirm whether an account exists.",
  },
  webRecoveryRequest: {
    source: "apps/web/src/app/api/auth/recovery-request/route.ts",
    disclosure: "generic",
    limits: ["source", "target", "surge"],
    reason: "Recovery requests always advance without confirming the address.",
  },
  mobileLogin: {
    source: "apps/web/src/features/mobile/server/routes/auth-login.ts",
    disclosure: "generic",
    limits: ["target"],
    reason: "Native password rejection follows the same account privacy rule.",
  },
  mobileRecoveryRequest: {
    source: "apps/web/src/features/mobile/server/routes/auth-recovery-request.ts",
    disclosure: "generic",
    limits: ["source", "target", "surge"],
    reason: "Native recovery advances for known and unknown addresses alike.",
  },
  invitationLookup: {
    source: "apps/web/src/app/api/invitations/lookup/route.ts",
    disclosure: "capability",
    limits: ["source"],
    reason: "A live opaque invitation may reveal only its bounded organization context.",
  },
  invitationRegistration: {
    source: "apps/web/src/app/api/invitations/register/route.ts",
    disclosure: "capability",
    limits: ["source", "target"],
    reason: "A live invitation is required before account state can be returned.",
  },
  organizationDiscovery: {
    source: "apps/web/src/app/api/validate-domain/route.ts",
    disclosure: "intentional-discovery",
    limits: ["source"],
    reason: "Organization lookup is the product's explicit signed-out discovery step.",
  },
} as const satisfies Record<string, PublicIdentityOperation>;

export const BROWSER_SECRET_QUERY_CONSUMERS = {
  "apps/web/src/app/(app)/accept-invite/page.tsx": ["token"],
  "apps/web/src/app/(app)/auth/callback/route.ts": ["code"],
  "apps/web/src/app/(app)/auth/confirm/route.ts": ["token_hash"],
  "apps/web/src/app/(app)/auth/verify/page.tsx": ["token_hash"],
} as const satisfies Record<string, readonly string[]>;
