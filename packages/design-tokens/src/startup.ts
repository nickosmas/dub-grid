/**
 * When a startup surface is allowed to say something.
 *
 * Shared by the web auth handoff and the mobile splash gate so one launch does
 * not go quiet for two seconds on one platform and nine on the other.
 *
 * The mark on these surfaces is static, so none of this is a brand beat: it is
 * the liveness budget. A launch that resolves inside `STARTUP_STATUS_DELAY_MS`
 * shows only the mark and its progress indicator, one slower than that earns an
 * explanation, and one past `STARTUP_TIMEOUT_MS` earns a way out.
 */

/**
 * How long a launch may stay silent. Below this a status line is noise: it
 * appears and vanishes before it can be read, which reads as a flicker rather
 * than as reassurance.
 */
export const STARTUP_STATUS_DELAY_MS = 2_500;

/**
 * When a wait stops being a wait and becomes something the user should be able
 * to act on. Past this the surface offers Retry, and says so plainly when the
 * device is offline.
 */
export const STARTUP_TIMEOUT_MS = 9_000;

/**
 * The only reason to hold a resolved splash at all: a launch that resolves in
 * two frames would otherwise paint the mark and tear it away inside 30ms,
 * which reads as a glitch.
 *
 * This used to be 900ms, to give the animated mark time to play. The mark is
 * static now, so there is nothing to play and nothing to protect but the
 * flicker. The other 750ms were latency the user could feel.
 */
export const STARTUP_MIN_SPLASH_MS = 150;
