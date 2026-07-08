import { NextResponse, type NextRequest } from "next/server";

type RequestLike = {
  headers?: {
    get(name: string): string | null;
  };
};

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    const normalizedHostname = normalizeHostname(hostname);

    return (
      normalizedHostname === "localhost" ||
      normalizedHostname === "127.0.0.1" ||
      normalizedHostname === "0.0.0.0" ||
      normalizedHostname === "::1"
    );
  } catch {
    return false;
  }
}

function getAllowedOrigin(req: RequestLike): string | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const origin = req.headers?.get("origin")?.trim();
  if (!origin || !isLoopbackOrigin(origin)) {
    return null;
  }

  return origin;
}

function appendVaryHeader(headers: Headers, value: string) {
  const currentValue = headers.get("Vary");
  if (!currentValue) {
    headers.set("Vary", value);
    return;
  }

  const values = currentValue.split(",").map((item) => item.trim().toLowerCase());
  if (!values.includes(value.toLowerCase())) {
    headers.set("Vary", `${currentValue}, ${value}`);
  }
}

export function withMobileCors(
  req: RequestLike,
  response: NextResponse,
  methods: readonly string[],
): NextResponse {
  const allowedOrigin = getAllowedOrigin(req);
  if (!allowedOrigin) {
    return response;
  }

  const requestedHeaders = req.headers?.get("access-control-request-headers")?.trim();
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", methods.join(", "));
  response.headers.set(
    "Access-Control-Allow-Headers",
    requestedHeaders || "Authorization, Content-Type",
  );
  response.headers.set("Access-Control-Max-Age", "600");
  appendVaryHeader(response.headers, "Origin");

  return response;
}

export function createMobileOptionsHandler(methods: readonly string[]) {
  return function OPTIONS(req: NextRequest) {
    return withMobileCors(req, new NextResponse(null, { status: 204 }), methods);
  };
}
