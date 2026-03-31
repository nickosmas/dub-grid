import pino from "pino";

/**
 * Structured logger for DubGrid.
 * - JSON output in production (for Vercel Log Drain / Axiom / Datadog)
 * - Pretty-printed in development
 */
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
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
