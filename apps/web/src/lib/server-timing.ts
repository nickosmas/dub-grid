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

export const PERF_TIMING_ENABLED = process.env.PERF_TIMING === "1";

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
