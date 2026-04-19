import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  mobileAuthLoginBodySchema,
  mobileAuthLoginResponseSchema,
} from "@dubgrid/contracts";
import { checkRateLimit, loginLimiter } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import { RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { createMobileOptionsHandler, withMobileCors } from "./cors";

type WorkspaceMembership = {
  org_id: string;
  org_name: string;
  org_slug: string | null;
  is_active: boolean;
};

function isValidWorkspaceSlug(slug: string) {
  return (
    !!slug &&
    !RESERVED_SUBDOMAINS.has(slug) &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)
  );
}

async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(email.toLowerCase()),
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function createEphemeralAuthClient(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export const dynamic = "force-dynamic";
const CORS_METHODS = ["POST", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

export async function POST(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = mobileAuthLoginBodySchema.safeParse(body);
  if (!parsed.success || !isValidWorkspaceSlug(parsed.data.workspaceSlug)) {
    return json(
      { error: "Enter a valid workspace slug, email, and password." },
      { status: 400 },
    );
  }

  const emailHash = await hashEmail(parsed.data.email);
  const { limited, misconfigured, reset } = await checkRateLimit(
    loginLimiter,
    `login:${emailHash}`,
  );

  if (misconfigured) {
    return json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 900;
    return json(
      {
        error: "Too many login attempts. Please try again later.",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const serviceClient = getServiceClient();
  const { data: workspace, error: workspaceError } = await serviceClient
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", parsed.data.workspaceSlug)
    .maybeSingle();

  if (workspaceError) {
    return json(
      { error: "We could not verify that workspace right now." },
      { status: 503 },
    );
  }

  if (!workspace || typeof workspace.slug !== "string") {
    return json(
      { error: "No workspace matched that slug." },
      { status: 404 },
    );
  }

  const { data: authData, error: authError } =
    await serviceClient.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

  if (
    authError ||
    !authData.session ||
    !authData.user ||
    !authData.session.access_token ||
    !authData.session.refresh_token
  ) {
    return json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  if (!authData.user.email_confirmed_at) {
    return json(
      { error: "Verify your email on the web before using mobile." },
      { status: 403 },
    );
  }

  const verifiedTotpFactors = (authData.user.factors ?? []).filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  if (verifiedTotpFactors.length > 0) {
    return json(
      {
        error:
          "Two-factor authentication is not yet supported in mobile. Please use the web app to sign in.",
      },
      { status: 409 },
    );
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("platform_role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    return json(
      { error: "We could not finish signing you in right now." },
      { status: 503 },
    );
  }

  if ((profile?.platform_role as string | null) === "gridmaster") {
    return json(
      { error: "Gridmaster accounts are not supported in the mobile app." },
      { status: 403 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const sessionClient = createEphemeralAuthClient(supabaseUrl, anonKey);
  const { error: setSessionError } = await sessionClient.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
  });

  if (setSessionError) {
    return json(
      { error: "We could not finish signing you in right now." },
      { status: 503 },
    );
  }

  const membershipsResult = await sessionClient.rpc("get_my_organizations");
  const memberships = (membershipsResult.data ?? []) as WorkspaceMembership[];

  if (membershipsResult.error) {
    return json(
      { error: "We could not verify your workspace access." },
      { status: 403 },
    );
  }

  const targetMembership = memberships.find(
    (membership) => membership.org_slug === workspace.slug,
  );

  if (!targetMembership) {
    return json(
      { error: "Your account is not associated with that workspace." },
      { status: 403 },
    );
  }

  let currentSession = authData.session;
  if (!targetMembership.is_active) {
    const switchResult = await sessionClient.rpc("switch_org", {
      target_org_id: targetMembership.org_id,
    });

    if (switchResult.error) {
      return json(
        { error: "We could not switch your workspace right now." },
        { status: 400 },
      );
    }

    const refreshResult = await sessionClient.auth.refreshSession();
    if (refreshResult.error || !refreshResult.data.session) {
      return json(
        { error: "We could not refresh your session after switching workspaces." },
        { status: 503 },
      );
    }

    currentSession = refreshResult.data.session;
  }

  return json(
    mobileAuthLoginResponseSchema.parse({
      session: {
        accessToken: currentSession.access_token,
        refreshToken: currentSession.refresh_token,
        expiresIn: currentSession.expires_in,
        tokenType: currentSession.token_type,
      },
      workspace: {
        id: workspace.id as string,
        name: workspace.name as string,
        slug: workspace.slug,
      },
      user: {
        id: authData.user.id,
        email: authData.user.email ?? null,
        firstName:
          (authData.user.user_metadata?.first_name as string | undefined) ?? null,
        lastName:
          (authData.user.user_metadata?.last_name as string | undefined) ?? null,
      },
    }),
  );
}
