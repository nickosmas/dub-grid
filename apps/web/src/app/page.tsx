"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
// @/features/account/client is imported dynamically inside the session effect —
// see the comment there. A static import here pulls the Supabase auth SDK into
// the landing page's initial bundle for visitors who are not signed in.
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { Button } from "@/components/Button";
import ButtonSpinner from "@/components/ButtonSpinner";
import { openConsentPreferences } from "@/components/CookieConsent";
import { CloseButton } from "@/components/ui/CloseButton";
import { buildSubdomainHost, isApexHost, parseHost } from "@/lib/subdomain";
import { withThemeParam } from "@/lib/theme-preference";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { LandingScreenshot, landingScreenshots } from "@/components/landing/LandingScreenshot";
import { LandingPhone } from "@/components/landing/LandingPhone";
import {
  BellRing,
  CalendarDays,
  KeyRound,
  Users,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Repeat,
  Settings,
  ScrollText,
  Radio,
  BarChart3,
  Mail,
  Menu,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

/* ─── Data ────────────────────────────────────────────── */

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: CalendarDays,
    title: "Easy scheduling",
    description:
      "Click, drag, drop... Your choice! Build the week in a grid that prints cleanly and publishes when you're ready.",
  },
  {
    icon: Users,
    title: "Your team on file",
    description:
      "Profiles, certifications, focus areas, and statuses. Sort by name or seniority, filter down to whoever you need.",
  },
  {
    icon: Shield,
    title: "The right access",
    description:
      "Owners, admins, and staff each see what's theirs. Fine-tune what each admin can change.",
  },
  {
    icon: Radio,
    title: "Stay in sync",
    description: "Publish the schedule and connected web and mobile apps refresh as changes land.",
  },
  {
    icon: BarChart3,
    title: "Spot every gap",
    description:
      "Open shifts, hour counts, and color-coded shift codes. See where coverage falls short, at a glance.",
  },
  {
    icon: Repeat,
    title: "Recurring shifts",
    description:
      "Set each person's regular weekly shifts once, then apply the template across any date range.",
  },
  {
    icon: Settings,
    title: "Speaks your language",
    description: "Call focus areas, certifications, and roles whatever your facility calls them.",
  },
  {
    icon: Mail,
    title: "Invite only",
    description:
      "Every account starts from a link that expires in 72 hours. No open sign-ups, no surprises.",
  },
];

const SECURITY_FEATURES: Feature[] = [
  {
    icon: ShieldCheck,
    title: "Role-based access",
    description: "Owners, admins, and staff see only the parts of DubGrid that match their role.",
  },
  {
    icon: SlidersHorizontal,
    title: "Admin permissions",
    description:
      "Choose exactly which scheduling and people-management actions each admin can take.",
  },
  {
    icon: KeyRound,
    title: "Two-factor authentication",
    description: "Add a verified authenticator step to protect sign-ins for sensitive roles.",
  },
  {
    icon: Mail,
    title: "Invite-only accounts",
    description:
      "Every account starts with an individual invitation link that expires after 72 hours.",
  },
  {
    icon: BellRing,
    title: "Security activity alerts",
    description:
      "Stay informed about password, email, MFA, new-device, and account-access changes.",
  },
  {
    icon: ScrollText,
    title: "Activity history",
    description: "Review role, membership, billing, and configuration changes in one place.",
  },
];

/* ─── Scroll Reveal Hook ──────────────────────────────── */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

/* ─── Section Wrapper ─────────────────────────────────── */

function RevealSection({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const { ref, isVisible } = useScrollReveal();
  return (
    <section
      ref={ref}
      id={id}
      className={`${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
      style={{
        transition:
          "opacity 700ms ease-out, transform 700ms ease-out, " +
          "background-color var(--dg-duration-fast) ease, color var(--dg-duration-fast) ease",
      }}
    >
      {children}
    </section>
  );
}

/* ─── Main Page ───────────────────────────────────────── */

export default function RootPage() {
  const router = useRouter();
  // Starts true so the prerendered HTML carries the actual marketing page.
  // Initialising it false put a spinner in the static output, which meant the
  // largest paint could not happen until the bundle had downloaded, parsed and
  // hydrated — throwing away the whole benefit of prerendering this route. Only
  // a visitor we can already tell is signed in is switched to the spinner, and
  // only to cover the redirect.
  const [ready, setReady] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [gridmasterLoginHref, setGridmasterLoginHref] = useState("/login");
  const { theme } = useTheme();

  useEffect(() => {
    // The Gridmaster host is a separate origin with its own localStorage, so
    // the link hands the theme over like every other deliberate origin hop.
    setGridmasterLoginHref(
      withThemeParam(
        `${window.location.protocol}//${buildSubdomainHost("gridmaster", parseHost(window.location.host))}/login`,
        theme,
      ),
    );
  }, [theme]);

  /* Session redirect.
   *
   * Only a visitor who actually carries a Supabase auth cookie waits for this.
   * Everyone else — every first-time visitor, and every crawler and speed test
   * — renders immediately, because the cookie check is synchronous and local.
   *
   * It used to gate the whole page on `getVerifiedBrowserAuthUser()`, which
   * meant nothing painted until the bundle had parsed *and* a round trip to
   * Supabase Auth came back, with a 5s blank-screen fallback behind it. The
   * marketing page is prerendered; holding it behind a network call threw that
   * away for the overwhelming majority of visitors, who are signed out.
   *
   * The SDK import is dynamic for the same reason: statically imported it put
   * the whole auth client in the landing page's initial bundle.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsSignIn = params.get("signin") === "1";
    if (wantsSignIn) {
      router.replace("/login");
      return;
    }

    // Matches the plain and the chunked cookie names @supabase/ssr writes.
    // No cookie means no session to redirect to, so nothing further runs: no
    // SDK download, no network call, and the page stays as rendered.
    if (!/(^|;\s*)sb-[^=;]*auth-token(\.\d+)?=/.test(document.cookie)) return;

    // Signed in (probably): cover the redirect rather than flashing marketing
    // copy at someone who already has an account.
    setReady(false);

    let cancelled = false;
    const checkSession = async () => {
      try {
        const { getVerifiedBrowserAuthUser, fetchAccountIdentity } =
          await import("@/features/account/client");
        const user = await getVerifiedBrowserAuthUser();
        if (cancelled) return;
        if (user) {
          const parsed = parseHost(window.location.host);
          if (isApexHost(parsed)) {
            const identity = await fetchAccountIdentity();
            if (identity.orgSlug) {
              const host = buildSubdomainHost(identity.orgSlug, parsed);
              window.location.replace(`${window.location.protocol}//${host}/schedule`);
              return;
            }
          }
          window.location.replace("/dashboard");
        } else {
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    };

    // A stale cookie must not strand a visitor on the spinner.
    const timeout = setTimeout(() => setReady(true), 5000);
    checkSession().finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [router]);

  /* Loading state */
  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--dg-color-bg)",
        }}
      >
        <ButtonSpinner color="var(--dg-color-brand)" size={32} />
      </div>
    );
  }

  return (
    <div className="landing-page min-h-screen text-[var(--dg-color-text-primary)] font-sans overflow-x-hidden">
      <div className="landing-hero-gradient" aria-hidden="true" />
      {/* ── Navbar ── */}
      <nav className="landing-nav fixed top-0 left-0 right-0 z-50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <DubGridLogo size={28} color="var(--dg-color-text-inverse)" />
            <DubGridWordmark fontSize={18} color="var(--dg-color-text-inverse)" />
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggleButton onDarkSurface />
            <Link
              href="/login"
              prefetch={false}
              className="landing-nav-sign-in hidden sm:inline-flex dg-btn dg-btn-lg"
            >
              Sign In
            </Link>
            {/* Mobile hamburger */}
            <Button
              onClick={() => setMobileMenuOpen(true)}
              className="landing-nav-menu md:hidden p-2 -mr-2 transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Menu Overlay ── */}
      {mobileMenuOpen && (
        <div className="landing-mobile-menu fixed inset-0 z-[60] flex flex-col">
          <div className="flex items-center justify-between px-6 h-14">
            <div className="flex items-center gap-2.5">
              <DubGridLogo size={28} color="var(--dg-color-brand)" />
              <DubGridWordmark fontSize={18} />
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggleButton />
              <CloseButton
                size="lg"
                className="-mr-2"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <Link href="/login" prefetch={false} className="dg-btn dg-btn-primary dg-btn-lg">
              Sign In
            </Link>
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="landing-hero relative flex items-center justify-center overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 text-center pt-28 pb-28 sm:pb-32">
          {/* Headline */}
          <h1 className="dg-font-brand-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] text-white leading-[1.05]">
            Scheduling, done right.
            <br />
            <span className="text-white/80">Ditch the spreadsheet.</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg md:text-xl text-white/85 max-w-2xl mx-auto leading-relaxed">
            Built for the way care teams actually work. Quick to build the schedule, easy to fill a
            gap, and right in your pocket on iOS and Android.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link href="/request-demo" className="landing-hero-primary dg-btn dg-btn-lg">
              Request Demo
              <ArrowRight size={18} />
            </Link>
            <a href="#features" className="landing-hero-secondary dg-btn dg-btn-lg">
              See Features
            </a>
          </div>
        </div>
      </section>

      {/* ── Schedule Grid Mockup ── */}
      <RevealSection className="landing-hero-screenshot -mt-20 pb-12 sm:pb-16">
        <div className="landing-hero-screenshot-stage max-w-5xl mx-auto px-6">
          <div className="landing-hero-phone landing-hero-phone-left">
            <LandingPhone screen="home" decorative />
          </div>
          <div className="landing-hero-phone landing-hero-phone-right">
            <LandingPhone screen="schedule" decorative />
          </div>
          <LandingScreenshot
            asset={landingScreenshots.schedule}
            priority
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1024px"
            className="landing-screenshot-hero"
          />
        </div>
      </RevealSection>

      {/* ── Bento Feature Grid ── */}
      <RevealSection id="features" className="py-16 sm:py-20 lg:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="dg-font-brand-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--dg-color-text-primary)]">
              Everything you need, nothing you don't
            </h2>
            <p className="mt-4 text-lg text-[var(--dg-color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Made for the way care teams actually work.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="landing-feature-card group rounded-2xl border border-[var(--dg-color-border-light)] p-6 lg:p-8 hover:border-[var(--dg-color-border)] hover:-translate-y-0.5 transition-all duration-150"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--dg-color-bg-secondary)] flex items-center justify-center mb-4 group-hover:bg-[var(--dg-color-border-light)] transition-colors duration-150">
                    <Icon
                      size={20}
                      className="text-[var(--dg-color-text-muted)] group-hover:text-[var(--dg-color-text-muted)] transition-colors duration-150"
                    />
                  </div>
                  <h3 className="dg-font-brand-heading text-base font-semibold text-[var(--dg-color-text-secondary)] mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[var(--dg-color-text-muted)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </RevealSection>

      {/* ── Dashboard Mockup ── */}
      <RevealSection className="landing-section-alt py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="dg-font-brand-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--dg-color-text-primary)]">
              The full picture
            </h2>
            <p className="mt-4 text-lg text-[var(--dg-color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Coverage, hours, and open shifts on one screen. Catch a gap before it catches you.
            </p>
          </div>
          <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,4fr)_minmax(0,1fr)]">
            <div className="space-y-6 text-center xl:text-left">
              <div>
                <h3 className="dg-font-brand-heading text-base font-semibold text-[var(--dg-color-text-secondary)]">
                  See coverage at a glance
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--dg-color-text-muted)]">
                  Spot understaffed days, overloaded team members, and empty slots before they
                  become a scramble.
                </p>
              </div>
              <div>
                <h3 className="dg-font-brand-heading text-base font-semibold text-[var(--dg-color-text-secondary)]">
                  Plan with real numbers
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--dg-color-text-muted)]">
                  Compare scheduled hours with your coverage needs while you build the week, not
                  after it is published.
                </p>
              </div>
            </div>

            <LandingScreenshot
              asset={landingScreenshots.dashboard}
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1024px"
            />

            <div className="space-y-6 text-center xl:text-left">
              <div>
                <h3 className="dg-font-brand-heading text-base font-semibold text-[var(--dg-color-text-secondary)]">
                  Resolve gaps faster
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--dg-color-text-muted)]">
                  Open shifts stay visible, so you can match the right person before coverage slips.
                </p>
              </div>
              <div>
                <h3 className="dg-font-brand-heading text-base font-semibold text-[var(--dg-color-text-secondary)]">
                  Follow changes as they happen
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--dg-color-text-muted)]">
                  Published schedules, shift changes, requests, and team updates are collected in
                  one activity feed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </RevealSection>

      {/* ── Staff View Mockup ── */}
      <RevealSection className="landing-section-alt py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="dg-font-brand-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--dg-color-text-primary)]">
              Your whole team, one screen
            </h2>
            <p className="mt-4 text-lg text-[var(--dg-color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Certifications, focus areas, and account status. Filter to whoever you need, sorted by
              name or seniority.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <LandingScreenshot
              asset={landingScreenshots.team}
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 85vw, 896px"
            />
          </div>
        </div>
      </RevealSection>

      {/* ── Mobile App Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="dg-font-brand-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--dg-color-text-primary)]">
              Your schedule, in your pocket
            </h2>
            <p className="mt-4 text-lg text-[var(--dg-color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Check the week, swap a shift, or grab an open shift right from your phone. Native iOS
              and Android.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <LandingPhone screen="home" />
            <LandingPhone screen="schedule" />
            <LandingPhone screen="requests" />
          </div>
        </div>
      </RevealSection>

      {/* ── Security features ── */}
      <RevealSection className="landing-section-alt py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="dg-font-brand-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--dg-color-text-primary)]">
              Security that stays out of your way
            </h2>
            <p className="mt-4 text-lg text-[var(--dg-color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Keep account access protected with clear security controls that are easy to review.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SECURITY_FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="landing-feature-card rounded-2xl border border-[var(--dg-color-border-light)] p-6"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--dg-color-bg-secondary)] flex items-center justify-center mb-4">
                    <Icon size={20} className="text-[var(--dg-color-text-muted)]" />
                  </div>
                  <h3 className="dg-font-brand-heading text-base font-semibold text-[var(--dg-color-text-secondary)] mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[var(--dg-color-text-muted)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </RevealSection>

      {/* ── CTA ── */}
      <RevealSection className="landing-cta-section py-12 sm:py-16 lg:py-20">
        <div className="landing-cta max-w-5xl mx-auto px-6 py-14 sm:px-10 sm:py-16 lg:px-16 lg:py-20 text-center">
          <h2 className="dg-font-brand-heading text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-[var(--dg-color-text-primary)]">
            Done with
            <br />
            the spreadsheet?
          </h2>
          <p className="text-lg text-[var(--dg-color-text-muted)] mt-4 max-w-xl mx-auto">
            Your team deserves something that just works.
          </p>
          <Link href="/request-demo" className="mt-8 dg-btn dg-btn-primary dg-btn-lg">
            Request Demo
            <ArrowRight size={18} />
          </Link>
        </div>
      </RevealSection>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--dg-color-border-light)]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <a href={gridmasterLoginHref} className="flex items-center gap-2.5">
            <DubGridLogo size={20} color="var(--dg-color-text-faint)" />
            <span className="text-xs text-[var(--dg-color-text-faint)]">
              &copy; {new Date().getFullYear()} DubGrid
            </span>
          </a>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="text-xs font-medium text-[var(--dg-color-text-label)] hover:text-[var(--dg-color-text-primary)] transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-xs font-medium text-[var(--dg-color-text-label)] hover:text-[var(--dg-color-text-primary)] transition-colors"
            >
              Terms of Service
            </Link>
            <Button
              type="button"
              onClick={openConsentPreferences}
              className="text-xs font-medium text-[var(--dg-color-text-label)] hover:text-[var(--dg-color-text-primary)] transition-colors"
            >
              Cookie preferences
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
