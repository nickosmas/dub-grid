import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { clientEnv } from "@/lib/env";

function forbidden(): NextResponse {
  return NextResponse.json({ success: false, error: API_ERRORS.FORBIDDEN }, { status: 403 });
}

function parseOrigin(value: string): string | null {
  if (value.trim() !== value || value === "null" || value.includes(",")) return null;

  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function configuredOrigin(): string | null {
  const siteUrl = clientEnv?.NEXT_PUBLIC_SITE_URL;
  return siteUrl ? parseOrigin(siteUrl) : null;
}

function requestOrigin(req: NextRequest): string | null {
  const trustForwarded = Boolean(clientEnv?.NEXT_PUBLIC_VERCEL_URL);
  const forwardedHost = trustForwarded ? req.headers.get("x-forwarded-host") : null;
  const forwardedProtocol = trustForwarded ? req.headers.get("x-forwarded-proto") : null;
  const host = forwardedHost ?? req.headers.get("host") ?? req.nextUrl.host;
  const protocol = forwardedProtocol ?? req.nextUrl.protocol.replace(":", "");

  if (!host || host.includes(",") || !/^(?:https?|HTTPS?)$/.test(protocol)) return null;
  return parseOrigin(`${protocol.toLowerCase()}://${host}`);
}

/** Validates a browser mutation against the exact origin of its API endpoint. */
export function validateCsrfOrigin(req: NextRequest): NextResponse | null {
  const declaredOrigin = req.headers.get("origin");
  if (!declaredOrigin) {
    return process.env.NODE_ENV === "production" ? forbidden() : null;
  }

  const actual = requestOrigin(req) ?? configuredOrigin();
  const declared = parseOrigin(declaredOrigin);
  return actual && declared === actual ? null : forbidden();
}
