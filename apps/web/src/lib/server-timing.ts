import { serverEnv } from "@/lib/env.server";
/**
 * Lightweight, dependency-free server-side timing.
 *
 * Accumulates labeled spans and serializes them into a `Server-Timing`
 * response header, which surfaces natively in Chrome DevTools → Network →
 * Timing. Used to baseline the login → app-ready path (middleware + hot API
 * routes) before optimizing.
 *
 * Emission is gated behind `PERF_TIMING === "1"` so production is unaffected:
 * when disabled, `header()` returns null and callers skip setting the header.
 * The `time`/`span` measurement work still runs (it's negligible), keeping
 * call sites branch-free.
 */

export const PERF_TIMING_ENABLED = serverEnv?.PERF_TIMING === "1";

type Span = { name: string; dur: number; desc?: string };

export class Timer {
  private spans: Span[] = [];

  /** Record a pre-measured span (milliseconds). */
  add(name: string, durationMs: number, description?: string): void {
    this.spans.push({ name, dur: durationMs, desc: description });
  }

  /** Time an async operation and record it as a span. */
  async time<T>(name: string, fn: () => Promise<T>, description?: string): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.add(name, performance.now() - start, description);
    }
  }

  /** Start a manual span; call the returned fn to stop and record it. */
  start(name: string, description?: string): () => void {
    const begin = performance.now();
    return () => this.add(name, performance.now() - begin, description);
  }

  /**
   * Serialize to a `Server-Timing` header value, or null when disabled / empty.
   * Names are sanitized to the token charset the header grammar allows.
   */
  header(): string | null {
    if (!PERF_TIMING_ENABLED || this.spans.length === 0) return null;
    return this.spans
      .map((s) => {
        const name = s.name.replace(/[^a-zA-Z0-9_-]/g, "_");
        const dur = `dur=${s.dur.toFixed(1)}`;
        const desc = s.desc ? `;desc=${JSON.stringify(s.desc)}` : "";
        return `${name};${dur}${desc}`;
      })
      .join(", ");
  }

  /** Set the header on a Headers/response-like object when enabled. */
  applyTo(headers: Headers): void {
    const value = this.header();
    if (value) headers.set("Server-Timing", value);
  }
}

/**
 * Wraps a route handler so every response carries a `Server-Timing` header.
 *
 * Applied at the export site — `export const GET = withTiming(handleGET)` —
 * rather than by wrapping the handler body, so adding it to an existing route
 * is a two-line change that does not reindent or otherwise disturb the code
 * around it.
 *
 * Records `total` for free. The handler receives the timer, so it can add its
 * own spans (`auth`, `query`, ...) to say where that total actually went —
 * which is the part the Network tab cannot tell you on its own.
 */
export function withTiming<Req, Res extends { headers: Headers }>(
  handler: (req: Req, timer: Timer) => Promise<Res>,
): (req: Req) => Promise<Res> {
  return async (req: Req): Promise<Res> => {
    const timer = new Timer();
    const stop = timer.start("total");
    try {
      const res = await handler(req, timer);
      stop();
      timer.applyTo(res.headers);
      return res;
    } catch (err) {
      // A throwing handler still reaches the framework's error path; nothing
      // to attach a header to, so just let it through unchanged.
      throw err;
    }
  };
}
