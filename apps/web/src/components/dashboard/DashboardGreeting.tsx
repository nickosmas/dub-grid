import { useState } from "react";

import { getBrowserTimezone } from "@/lib/timezones";

type Bucket = "morning" | "afternoon" | "evening";

// General greetings — always safe to show, regardless of work state. Mix of
// plain hellos and open-ended CTAs that don't assume in-progress work.
const NAMED_POOLS: Record<Bucket, ReadonlyArray<(name: string) => string>> = {
  morning: [
    (n) => `Good morning, ${n}!`,
    (n) => `Morning, ${n}!`,
    (n) => `Rise and shine, ${n}!`,
    (n) => `Top of the morning, ${n}!`,
    (n) => `What's first today, ${n}?`,
    (n) => `Where should we start, ${n}?`,
    (n) => `Ready when you are, ${n}.`,
  ],
  afternoon: [
    (n) => `Good afternoon, ${n}!`,
    (n) => `Afternoon, ${n}!`,
    (n) => `Good to see you, ${n}!`,
    (n) => `Hope your day's going well, ${n}!`,
    (n) => `What's next, ${n}?`,
    (n) => `Where to next, ${n}?`,
    (n) => `Ready when you are, ${n}.`,
  ],
  evening: [
    (n) => `Good evening, ${n}!`,
    (n) => `Evening, ${n}!`,
    (n) => `Hope you had a good one, ${n}!`,
    (n) => `Winding down, ${n}!`,
    (n) => `What's left to do, ${n}?`,
    (n) => `Ready when you are, ${n}.`,
  ],
};

const ANON_POOLS: Record<Bucket, ReadonlyArray<string>> = {
  morning: [
    "Good morning!",
    "Morning!",
    "Rise and shine!",
    "Bright and early!",
    "What's first today?",
    "Where should we start?",
    "Ready when you are.",
  ],
  afternoon: [
    "Good afternoon!",
    "Afternoon!",
    "Hope your day's going well!",
    "What's next?",
    "Where to next?",
    "Ready when you are.",
  ],
  evening: [
    "Good evening!",
    "Evening!",
    "Hope you had a good one!",
    "Winding down!",
    "What's left to do?",
  ],
};

// Continuation greetings — only mixed in when `hasIncompleteWork` is true
// (unsaved schedule drafts, an unfinished setup checklist, etc.). These
// assume the user has work in progress, so showing them on a fully-built,
// fully-published org would feel off.
const CONTINUATION_NAMED: ReadonlyArray<(name: string) => string> = [
  (n) => `Pick up where you left off, ${n}!`,
  (n) => `Welcome back, ${n}! Let's finish up.`,
  (n) => `Back at it, ${n}?`,
  (n) => `${n}, you've got work waiting!`,
];

const CONTINUATION_ANON: ReadonlyArray<string> = [
  "Pick up where you left off!",
  "Welcome back! Let's finish up.",
  "You've got work waiting!",
];

const NAMED_WELCOMES: ReadonlyArray<(name: string) => string> = [
  (n) => `Welcome, ${n}!`,
  (n) => `Welcome aboard, ${n}!`,
  (n) => `Glad you're here, ${n}!`,
  (n) => `Welcome to DubGrid, ${n}!`,
  (n) => `Hi ${n}, welcome in!`,
  (n) => `Welcome, ${n}! Let's get you set up.`,
  (n) => `Welcome aboard, ${n}! Take a look around.`,
];

const ANON_WELCOMES: ReadonlyArray<string> = [
  "Welcome!",
  "Welcome aboard!",
  "Glad you're here!",
  "Welcome to DubGrid!",
  "Welcome! Let's get you set up.",
];

function getBucket(hour: number): Bucket {
  if (hour < 5) return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function isoDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function indexAt<T>(pool: ReadonlyArray<T>, factor: number): T {
  return pool[Math.floor(factor * pool.length)];
}

const GREETED_PREFIX = "dg-greeted-";
// Picked headline cached in sessionStorage for the lifetime of the tab. Two
// reasons:
//   - React StrictMode + Turbopack dev mode mount the component, unmount it,
//     then remount it; each mount runs useState's lazy initializer with a
//     fresh Math.random(), so without a cache the first paint and the second
//     paint would show different greetings.
//   - Re-navigating to /dashboard within the same session should keep the
//     same greeting rather than reshuffling on every mount.
// Cleared on sign-out via clearDubgridSessionState (it's a dg_* key), so the
// next sign-in always picks a fresh greeting.
const GREETING_CACHE_KEY = "dg_dashboard_greeting";

function pickHeadline(
  name: string | null,
  userId: string | null,
  now: Date,
  hasIncompleteWork: boolean,
): string {
  let isFirstVisit = false;
  if (userId) {
    const key = `${GREETED_PREFIX}${userId}`;
    try {
      const seen = window.localStorage.getItem(key);
      if (!seen) {
        isFirstVisit = true;
        window.localStorage.setItem(key, isoDate(new Date()));
      }
    } catch {
      // localStorage unavailable (private mode) — treat as repeat visit so
      // we show the time-of-day greeting instead of forcing a welcome.
    }
  }
  const factor = Math.random();
  if (isFirstVisit) {
    return name
      ? indexAt(NAMED_WELCOMES, factor)(name)
      : indexAt(ANON_WELCOMES, factor);
  }
  const bucket = getBucket(now.getHours());
  if (name) {
    const pool = hasIncompleteWork
      ? [...NAMED_POOLS[bucket], ...CONTINUATION_NAMED]
      : NAMED_POOLS[bucket];
    return indexAt(pool, factor)(name);
  }
  const pool = hasIncompleteWork
    ? [...ANON_POOLS[bucket], ...CONTINUATION_ANON]
    : ANON_POOLS[bucket];
  return indexAt(pool, factor);
}

interface DashboardGreetingProps {
  name: string | null;
  now: Date;
  userId: string | null;
  // True when the user has unsaved schedule drafts OR the org setup checklist
  // still has incomplete steps. Unlocks "pick up where you left off"-style
  // continuation greetings, which would feel off on a fully-built org.
  hasIncompleteWork?: boolean;
  // Organization-configured timezone (organizations.timezone). Used for the
  // "Org" clock annotation. Defaults to UTC when null.
  orgTimezone?: string | null;
}

function formatTimeInZone(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
      timeZoneName: "short",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now);
  }
}

function formatDateInZone(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: tz,
    }).format(now);
  } catch {
    return "";
  }
}

export default function DashboardGreeting({
  name,
  now,
  userId,
  hasIncompleteWork = false,
  orgTimezone = null,
}: DashboardGreetingProps) {
  const userTz = getBrowserTimezone() ?? orgTimezone ?? "UTC";
  const effectiveOrgTz = orgTimezone ?? "UTC";
  const sameZone = userTz === effectiveOrgTz;
  const userDate = formatDateInZone(now, userTz);
  const orgDate = sameZone ? userDate : formatDateInZone(now, effectiveOrgTz);
  const userClock = formatTimeInZone(now, userTz);
  const orgClock = formatTimeInZone(now, effectiveOrgTz);

  // Pick once per tab session, scoped to bucket + date. Cached in sessionStorage so:
  //   - StrictMode / Turbopack dev double-mount doesn't reshuffle the headline
  //     between the first and second paint;
  //   - Re-navigating to /dashboard mid-session keeps the same greeting.
  // The cache is wiped by clearDubgridSessionState on sign-out, so the next
  // sign-in produces a fresh pick. We also invalidate on bucket/date drift so
  // a tab left open overnight doesn't surface yesterday-evening's "Good
  // evening" at 10am. DashboardGreeting is always rendered inside
  // ProtectedRoute (which returns null SSR-side), so this runs client-only
  // and storage access is safe.
  const [headline] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const bucket = getBucket(now.getHours());
    const date = isoDate(now);
    try {
      const raw = window.sessionStorage.getItem(GREETING_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as {
          bucket?: Bucket;
          date?: string;
          headline?: string;
        };
        if (
          cached.bucket === bucket &&
          cached.date === date &&
          typeof cached.headline === "string"
        ) {
          return cached.headline;
        }
      }
    } catch {
      // sessionStorage unavailable or stale JSON — fall through to a fresh
      // pick that just won't survive a re-mount. Harmless in production
      // (no StrictMode).
    }
    const picked = pickHeadline(name, userId, now, hasIncompleteWork);
    try {
      window.sessionStorage.setItem(
        GREETING_CACHE_KEY,
        JSON.stringify({ bucket, date, headline: picked }),
      );
    } catch {
      // Same as above — non-fatal.
    }
    return picked;
  });

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "2px 14px",
          fontSize: "var(--dg-fs-body-sm, 14px)",
          color: "var(--color-text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {sameZone ? (
          <span>
            {userDate} · {userClock}
          </span>
        ) : (
          <>
            <span>
              <span style={{ opacity: 0.7 }}>Local time</span> · {userDate} ·{" "}
              {userClock}
            </span>
            <span>
              <span style={{ opacity: 0.7 }}>Organization time</span> ·{" "}
              {orgDate} · {orgClock}
            </span>
          </>
        )}
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(1.5rem, 2.2vw, 2rem)",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.03em",
        }}
      >
        {headline}
      </h1>
    </div>
  );
}
