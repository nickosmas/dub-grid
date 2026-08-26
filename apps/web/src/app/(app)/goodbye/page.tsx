import Link from "next/link";
import { PageShell } from "@/components/auth/AuthCard";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { RunLogoutTeardown, type LogoutScope } from "./RunLogoutTeardown";

const HEADLINES: ReadonlyArray<string> = [
  "See you soon!",
  "Catch you later!",
  "Until next time!",
  "Take care!",
  "That's a wrap!",
  "All signed out!",
  "Signed out and squared away!",
  "Closing things out for now!",
  "Heading out? We'll be here when you're back.",
  "Powered down for now. Back soon!",
  "That's a wrap for today!",
  "Out for now, back when you're ready.",
  "All done. Take care!",
  "Signing off. See you next time!",
  "Logged out cleanly. Back when you're ready!",
  "That's it for today, catch you later!",
  "Heading out, we'll keep things warm!",
  "End of the line for now. See you soon!",
  "Out the door! See you next time.",
  "All wrapped up. Until next time!",
];

const SUBLINES: ReadonlyArray<string> = [
  "Sign back in whenever you're ready.",
  "Come back any time.",
  "Ready when you are.",
  "Thank you for using DubGrid.",
  "Your session has ended.",
  "Sign back in to continue.",
  "You have been securely signed out.",
  "Sign in when you're ready.",
  "Your data is safe.",
  "Sign back in any time.",
  "Sign in below to continue.",
  "Until your next sign-in.",
];

function pickRandom<T>(pool: ReadonlyArray<T>): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function parseScope(value: string | string[] | undefined): LogoutScope | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "local" || v === "global") return v;
  return null;
}

function parseReason(value: string | string[] | undefined): "inactivity" | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "inactivity" ? v : null;
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
        <Link
          href="/"
          className="dg-auth-logo-block"
          style={{
            marginBottom: "40px",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <DubGridLogo size={72} />
          <DubGridWordmark />
        </Link>

        <h1
          style={{
            margin: "0 0 16px",
            textAlign: "center",
            fontSize: "clamp(2rem, 4vw, 2.75rem)",
            fontWeight: 800,
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
