import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { JwtPayload, Session, User } from "@supabase/supabase-js";

type Claims = JwtPayload & {
  platform_role?: unknown;
  org_id?: unknown;
};

type AuthResult =
  | { session: Session; user: User }
  | { response: NextResponse };

type UserAuthResult =
  | { user: User }
  | { response: NextResponse };

type ClaimsAuthResult =
  | { session: Session; user: User; claims: Claims }
  | { response: NextResponse };

export function createRequestSupabaseClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          // Route handlers use the request-bound response separately.
        },
      },
    },
  );
}

export async function requireAuthenticatedSession(
  req: NextRequest,
): Promise<AuthResult> {
  const supabase = createRequestSupabaseClient(req);
  const [
    {
      data: { session },
    },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  if (!session?.access_token || !user) {
    return {
      response: NextResponse.json(
        { error: "Your session expired. Please sign in again." },
        { status: 401 },
      ),
    };
  }

  return { session, user };
}

export async function requireAuthenticatedUser(
  req: NextRequest,
): Promise<UserAuthResult> {
  const supabase = createRequestSupabaseClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Your session expired. Please sign in again." },
        { status: 401 },
      ),
    };
  }

  return { user };
}

export async function requireAuthenticatedUserWithClaims(
  req: NextRequest,
): Promise<ClaimsAuthResult> {
  const auth = await requireAuthenticatedSession(req);
  if ("response" in auth) {
    return auth;
  }

  const supabase = createRequestSupabaseClient(req);
  const claimsResult = await supabase.auth.getClaims(auth.session.access_token);
  const claims = claimsResult.data?.claims as Claims | undefined;

  if (claimsResult.error || !claims) {
    return {
      response: NextResponse.json(
        { error: "Your session could not be verified. Please sign in again." },
        { status: 401 },
      ),
    };
  }

  return { ...auth, claims };
}

export async function requireGridmasterSession(
  req: NextRequest,
): Promise<AuthResult> {
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) {
    return auth;
  }

  if (auth.claims.platform_role !== "gridmaster") {
    return {
      response: NextResponse.json(
        { error: "You don't have permission to use that area." },
        { status: 403 },
      ),
    };
  }

  return { session: auth.session, user: auth.user };
}
