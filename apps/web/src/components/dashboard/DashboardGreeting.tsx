import { useState } from "react";

import TimeZoneClocks from "@/components/TimeZoneClocks";

type Bucket = "morning" | "afternoon" | "evening";

// General greetings — always safe to show, regardless of work state. Kept
// short: a hello or an open-ended CTA, never a compound sentence.
const NAMED_POOLS: Record<Bucket, ReadonlyArray<(name: string) => string>> = {
  morning: [
    (n) => `Good morning, ${n}!`,
    (n) => `Morning, ${n}!`,
    (n) => `Rise and shine, ${n}!`,
    (n) => `What's first today, ${n}?`,
    (n) => `Ready when you are, ${n}.`,
  ],
  afternoon: [
    (n) => `Good afternoon, ${n}!`,
    (n) => `Afternoon, ${n}!`,
    (n) => `Good to see you, ${n}!`,
    (n) => `What's next, ${n}?`,
    (n) => `Ready when you are, ${n}.`,
  ],
  evening: [
    (n) => `Good evening, ${n}!`,
    (n) => `Evening, ${n}!`,
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
    "What's first today?",
    "Ready when you are.",
  ],
  afternoon: ["Good afternoon!", "Afternoon!", "What's next?", "Ready when you are."],
  evening: ["Good evening!", "Evening!", "Winding down!", "What's left to do?"],
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

// Base first-visit welcomes — safe for anyone, no assumption about setup state.
const NAMED_WELCOMES: ReadonlyArray<(name: string) => string> = [
  (n) => `Welcome, ${n}!`,
  (n) => `Welcome aboard, ${n}!`,
  (n) => `Glad you're here, ${n}!`,
  (n) => `Welcome to DubGrid, ${n}!`,
];

const ANON_WELCOMES: ReadonlyArray<string> = [
  "Welcome!",
  "Welcome aboard!",
  "Glad you're here!",
  "Welcome to DubGrid!",
];

// First-visit welcomes for admins whose org setup checklist is still
// incomplete (see `needsSetup`). Never shown to a user with nothing left to
// configure, or to a non-admin who couldn't act on it anyway.
const NAMED_WELCOMES_SETUP: ReadonlyArray<(name: string) => string> = [
  (n) => `Welcome, ${n}! Let's get you set up.`,
  (n) => `Welcome aboard, ${n}! Let's get set up.`,
  (n) => `Glad you're here, ${n}. Let's get set up.`,
];

const ANON_WELCOMES_SETUP: ReadonlyArray<string> = [
  "Welcome! Let's get you set up.",
  "Welcome aboard! Let's get set up.",
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

function resolveNamed(pool: ReadonlyArray<(name: string) => string>, name: string): string[] {
  return pool.map((render) => render(name));
}

// Picks by `factor` (0..1), but steps to the next pool entry when that pick
// would repeat the immediately preceding headline, so two consecutive
// mounts never show the exact same text.
function pickFromPool(pool: ReadonlyArray<string>, factor: number, avoid: string | null): string {
  if (pool.length === 0) return "";
  const start = Math.floor(factor * pool.length);
  if (avoid === null || pool.length === 1) return pool[start];
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(start + i) % pool.length];
    if (candidate !== avoid) return candidate;
  }
  return pool[start];
}

const GREETED_PREFIX = "dg-greeted-";

function pickHeadline(
  name: string | null,
  userId: string | null,
  now: Date,
  hasIncompleteWork: boolean,
  needsSetup: boolean,
  avoid: string | null,
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
    if (name) {
      const pool = resolveNamed(needsSetup ? NAMED_WELCOMES_SETUP : NAMED_WELCOMES, name);
      return pickFromPool(pool, factor, avoid);
    }
    return pickFromPool(needsSetup ? ANON_WELCOMES_SETUP : ANON_WELCOMES, factor, avoid);
  }
  const bucket = getBucket(now.getHours());
  if (name) {
    const pool = resolveNamed(
      hasIncompleteWork ? [...NAMED_POOLS[bucket], ...CONTINUATION_NAMED] : NAMED_POOLS[bucket],
      name,
    );
    return pickFromPool(pool, factor, avoid);
  }
  const pool = hasIncompleteWork
    ? [...ANON_POOLS[bucket], ...CONTINUATION_ANON]
    : ANON_POOLS[bucket];
  return pickFromPool(pool, factor, avoid);
}

interface DashboardGreetingProps {
  name: string | null;
  now: Date;
  userId: string | null;
  // True when the user has unsaved schedule drafts OR the org setup checklist
  // still has incomplete steps. Unlocks "pick up where you left off"-style
  // continuation greetings, which would feel off on a fully-built org.
  hasIncompleteWork?: boolean;
  // True only when THIS user can act on an incomplete org setup checklist
  // (admin capability + at least one core list still empty). Narrower than
  // `hasIncompleteWork`: gates the "let's get you set up" first-visit
  // welcome specifically, so it never shows to someone with nothing to set up.
  needsSetup?: boolean;
  // Organization-configured timezone (organizations.timezone). Used for the
  // "Org" clock annotation. Defaults to UTC when null.
  orgTimezone?: string | null;
}

// Guards against React StrictMode / Turbopack dev mode mounting a component,
// unmounting it, then remounting it: each mount runs useState's lazy
// initializer fresh, so without this the first paint and the second paint
// could show different random picks. A real navigation away and back always
// takes far longer than this window, so it still gets a fresh pick — only
// the synchronous dev double-mount gets deduped.
const REMOUNT_DEDUPE_MS = 50;
let lastMount: { key: string; headline: string; ts: number } | null = null;

export function __resetDashboardGreetingMountCacheForTests(): void {
  lastMount = null;
}

export default function DashboardGreeting({
  name,
  now,
  userId,
  hasIncompleteWork = false,
  needsSetup = false,
  orgTimezone = null,
}: DashboardGreetingProps) {
  // Picks a fresh headline on every real mount (login, or navigating to the
  // dashboard from elsewhere), so greetings don't repeat across visits. The
  // dedupe window above only protects against the synchronous dev
  // double-mount; it does not persist across an actual navigation.
  const [headline] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const bucket = getBucket(now.getHours());
    const date = isoDate(now);
    const key = `${bucket}|${date}|${userId ?? ""}`;
    const nowTs = Date.now();
    if (lastMount && lastMount.key === key && nowTs - lastMount.ts < REMOUNT_DEDUPE_MS) {
      return lastMount.headline;
    }
    const picked = pickHeadline(
      name,
      userId,
      now,
      hasIncompleteWork,
      needsSetup,
      lastMount?.headline ?? null,
    );
    lastMount = { key, headline: picked, ts: nowTs };
    return picked;
  });

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <TimeZoneClocks now={now} orgTimezone={orgTimezone} />
      <h1
        style={{
          margin: 0,
          fontSize: "var(--dg-type-page-title-size)",
          fontWeight: "var(--dg-type-page-title-weight)",
          color: "var(--dg-type-page-title-color)",
          letterSpacing: "var(--dg-type-page-title-letter-spacing)",
          lineHeight: "var(--dg-type-page-title-line-height)",
        }}
      >
        {headline}
      </h1>
    </div>
  );
}
