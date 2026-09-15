import pino from "pino";
import { serverEnv } from "@/lib/env.server";

/**
 * Structured logger for DubGrid.
 * - JSON output in production (for Vercel Log Drain / Axiom / Datadog)
 * - Pretty-printed in development
 */
const logger = pino({
  level: serverEnv?.LOG_LEVEL || "info",
  redact: {
    paths: [
      "password",
      "token",
      "token_hash",
      "access_token",
      "refresh_token",
      "authorization",
      "cookie",
      "*.password",
      "*.token",
      "*.token_hash",
      "*.access_token",
      "*.refresh_token",
      "*.authorization",
      "*.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino/file",
      options: { destination: 1 }, // stdout
    },
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  }),
});

/**
 * Create a child logger with request context for API routes / middleware.
 */
export function createRequestLogger(context: {
  requestId?: string;
  orgId?: string;
  userId?: string;
  path?: string;
}) {
  return logger.child(context);
}

export default logger;
