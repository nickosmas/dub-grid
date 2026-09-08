import { NextResponse, type NextRequest } from "next/server";
import { mobileAuthLoginBodySchema, mobileAuthLoginResponseSchema } from "@dubgrid/contracts";
import {
  createMobileEphemeralAuthClient,
  isValidMobileOrgSlug,
  loginMobileUser,
  MobileApiRequestError,
  normalizeMobileOrgSlug,
} from "@dubgrid/mobile-api-core";
import { checkRateLimit, loginLimiter } from "@/lib/rate-limit";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { getServiceClient } from "@/lib/supabase-service";
import { RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { createMobileOptionsHandler, withMobileCors } from "./cors";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase-keys";
import { API_ERRORS } from "@dubgrid/client-errors";
import { withTiming, type Timer } from "@/lib/server-timing";

async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(email.toLowerCase()));

  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export const dynamic = "force-dynamic";
const CORS_METHODS = ["POST", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

async function handlePOST(req: NextRequest, timer: Timer) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "We couldn't read that sign-in request. Try again." }, { status: 400 });
  }

  const parsed = mobileAuthLoginBodySchema.safeParse(body);
  const normalizedOrgSlug = parsed.success ? normalizeMobileOrgSlug(parsed.data.orgSlug) : "";

  if (!parsed.success || !isValidMobileOrgSlug(normalizedOrgSlug, RESERVED_SUBDOMAINS)) {
    return json(
      { error: "Enter a valid organization slug, email, and password." },
      { status: 400 },
    );
  }

  const { limited, misconfigured, reset } = await timer.time("rate_limit", async () => {
    const emailHash = await hashEmail(parsed.data.email);
    return checkRateLimit(loginLimiter, `login:${emailHash}`);
  });

  if (misconfigured) {
    return json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }

  if (limited) {
    const retryAfter = reset ? Math.ceil((reset - Date.now()) / 1000) : 900;
    return json(
      {
        error: "Too many sign-in attempts. Wait a few minutes and try again.",
        retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const serviceClient = getServiceClient();
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabasePublishableKey();
  if (!supabaseUrl || !anonKey) {
    return json({ error: "Server misconfigured" }, { status: 500 });
  }

  const sessionClient = createMobileEphemeralAuthClient(supabaseUrl, anonKey);

  try {
    const payload = await timer.time("login_flow", () =>
      loginMobileUser(serviceClient, sessionClient, {
        ...parsed.data,
        orgSlug: normalizedOrgSlug,
      }),
    );

    return json(mobileAuthLoginResponseSchema.parse(payload));
  } catch (error) {
    if (error instanceof MobileApiRequestError) {
      return json(
        {
          error: formatClientErrorMessage(error, "We could not finish signing you in right now."),
          ...(error.code ? { code: error.code } : {}),
        },
        { status: error.status },
      );
    }

    return json({ error: "We could not finish signing you in right now." }, { status: 503 });
  }
}

export const POST = withTiming(handlePOST);
