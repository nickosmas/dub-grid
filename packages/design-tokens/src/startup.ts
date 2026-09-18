/**
 * When a startup surface is allowed to say something.
 *
 * Shared by the web auth handoff and the mobile splash gate so one launch does
 * not go quiet for two seconds on one platform and nine on the other.
 *
 * A launch that resolves inside `STARTUP_STATUS_DELAY_MS` shows only the brand
 * surface, one slower than that earns an explanation, and one past
 * `STARTUP_TIMEOUT_MS` earns a way out. How long a splash holds for its own
 * sake is a per-platform brand decision and deliberately not here.
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
 * How long a surface must be waiting before painting a full-screen startup
 * state is worth it.
 *
 * Web starts with nothing on screen, so a session that restores in two frames
 * should go straight to the app rather than flash a brand surface on the way
 * past. Below this the surface is a flicker; above it, a blank frame is the
 * thing worth replacing.
 */
export const STARTUP_SURFACE_DELAY_MS = 150;
