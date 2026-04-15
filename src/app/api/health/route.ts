import { getServiceClient } from "@/lib/supabase-service";
import { getRateLimitConfigStatus } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Public health check endpoint for uptime monitors.
 * Checks DB and Redis connectivity.
 */
export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  // Check Supabase DB connectivity
  const dbStart = Date.now();
  try {
    const client = getServiceClient();
    const { error } = await client.from("organizations").select("id").limit(1);
    checks.db = error
      ? { status: "error", error: "query failed", latencyMs: Date.now() - dbStart }
      : { status: "ok", latencyMs: Date.now() - dbStart };
  } catch {
    checks.db = { status: "error", error: "connection failed", latencyMs: Date.now() - dbStart };
  }

  // Check Redis connectivity
  const redisStart = Date.now();
  try {
    const rateLimitConfig = getRateLimitConfigStatus();
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!redisUrl || !redisToken) {
      checks.redis = rateLimitConfig.productionReady
        ? { status: "unconfigured" }
        : { status: "error", error: rateLimitConfig.message ?? "Redis env vars are missing" };
    } else {
      const res = await fetch(`${redisUrl}/ping`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      });
      checks.redis = res.ok
        ? { status: "ok", latencyMs: Date.now() - redisStart }
        : { status: "error", error: `HTTP ${res.status}`, latencyMs: Date.now() - redisStart };
    }
  } catch {
    checks.redis = { status: "error", error: "connection failed", latencyMs: Date.now() - redisStart };
  }

  const allHealthy = Object.values(checks).every(
    (c) => c.status === "ok" || c.status === "unconfigured"
  );

  return Response.json(
    {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
