import { PageShell } from "@/components/auth/AuthCard";
import { DubGridStackedLockup } from "@/components/Logo";
import { RunLogoutTeardown, type LogoutReason, type LogoutScope } from "./RunLogoutTeardown";

const HEADLINES: ReadonlyArray<string> = [
  "See you soon!",
  "Until next time!",
  "Take care!",
  "Catch you later!",
];

const SUBLINES: ReadonlyArray<string> = ["You're signed out."];

function pickRandom<T>(pool: ReadonlyArray<T>): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function parseScope(value: string | string[] | undefined): LogoutScope | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "local" || v === "global") return v;
  return null;
}

function parseReason(value: string | string[] | undefined): LogoutReason | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "inactivity" || v === "password-changed" || v === "password-unconfirmed" ? v : null;
}

// Server component so the random pick happens once per request and is baked
// into the SSR'd HTML — no hydration mismatch, no client-side flash from one
// variant to another. RunLogoutTeardown is a client wrapper that performs the
// actual session teardown (queryClient.clear, signOutFromBrowser, etc.) on
// mount, keyed off the `?scope=` query param set by useLogout's signOut().
export const dynamic = "force-dynamic";

export default async function GoodbyePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[]; reason?: string | string[] }>;
}) {
  const headline = pickRandom(HEADLINES);
  const subline = pickRandom(SUBLINES);
  const resolvedSearchParams = await searchParams;
  const scope = parseScope(resolvedSearchParams.scope);
  const reason = parseReason(resolvedSearchParams.reason);

  return (
    <PageShell>
      <div
        className="dg-auth-card"
        style={{
          maxWidth: 560,
          padding: "64px 56px 56px",
        }}
      >
        {/* Home redirects to the apex on organization hosts: this must be a
            document navigation, not a cross-origin RSC request. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="dg-auth-logo-block"
          style={{
            marginBottom: "40px",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <DubGridStackedLockup />
        </a>

        <h1
          style={{
            margin: "0 0 16px",
            textAlign: "center",
            fontSize: "clamp(2rem, 4vw, 2.75rem)",
            fontWeight: "var(--dg-type-page-title-weight)",
            letterSpacing: "-0.03em",
            color: "var(--dg-color-text-primary)",
            lineHeight: 1.15,
          }}
        >
          {headline}
        </h1>

        <p
          style={{
            textAlign: "center",
            fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
            color: "var(--dg-color-text-muted)",
            marginBottom: "40px",
            fontWeight: 500,
            lineHeight: 1.5,
          }}
        >
          {subline}
        </p>

        <RunLogoutTeardown scope={scope} reason={reason} />
      </div>
    </PageShell>
  );
}
