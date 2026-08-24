"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
// @/features/account/client is imported dynamically inside the session effect —
// see the comment there. A static import here pulls the Supabase auth SDK into
// the landing page's initial bundle for visitors who are not signed in.
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { Button } from "@/components/Button";
import { openConsentPreferences } from "@/components/CookieConsent";
import { CloseButton } from "@/components/ui/CloseButton";
import { buildSubdomainHost, isApexHost, parseHost } from "@/lib/subdomain";
import ScheduleGridMockup from "@/components/landing/ScheduleGridMockup";
import ThemeToggleButton from "@/components/landing/ThemeToggleButton";
import StaffViewMockup from "@/components/landing/StaffViewMockup";
import SettingsMockup from "@/components/landing/SettingsMockup";
import RecurringShiftsMockup from "@/components/landing/RecurringShiftsMockup";
import DashboardMockup from "@/components/landing/DashboardMockup";
import MobileAppMockup from "@/components/landing/MobileAppMockup";
import {
  CalendarDays,
  Users,
  Shield,
  Repeat,
  Settings,
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
    title: "Build the week",
    description:
      "Drag, drop, done. Build the week in a grid that prints cleanly and publishes when you're ready.",
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
    title: "Always live",
    description:
      "Publish the schedule and it reaches every screen instantly. No stale printouts, no one working off the old version.",
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
            const slug = identity.orgSlug;
            if (slug) {
              const host = buildSubdomainHost(slug, parsed);
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
          background: "var(--color-bg)",
        }}
      >
        <div
          className="dg-spinner"
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--color-border)",
            borderTopColor: "var(--color-brand)",
            borderRadius: "50%",
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-text-primary)] font-sans overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-surface)]/80 backdrop-blur-xl border-b border-[var(--color-border-light)]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <DubGridLogo size={28} color="var(--color-brand)" />
            <DubGridWordmark fontSize={18} />
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggleButton />
            <Link
              href="/login"
              prefetch={false}
              className="hidden sm:inline-flex dg-btn dg-btn-primary dg-btn-lg"
            >
              Sign In
            </Link>
            {/* Mobile hamburger */}
            <Button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -mr-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Menu Overlay ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-[var(--color-surface)]/95 flex flex-col">
          <div className="flex items-center justify-between px-6 h-14">
            <div className="flex items-center gap-2.5">
              <DubGridLogo size={28} color="var(--color-brand)" />
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
      <section className="relative flex items-center justify-center overflow-hidden">
        {/* Mesh gradient background */}
        <div className="absolute inset-0 -z-10">
          <div
            className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.04]"
            style={{
              background: "radial-gradient(circle, var(--color-brand) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.03]"
            style={{
              background: "radial-gradient(circle, var(--color-brand) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.02]"
            style={{
              background: "radial-gradient(circle, var(--color-brand) 0%, transparent 60%)",
            }}
          />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center pt-28 pb-14">
          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] text-[var(--color-text-primary)] leading-[1.05]">
            Scheduling, done right.
            <br />
            <span className="text-[var(--color-brand)]">Ditch the spreadsheet.</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg md:text-xl text-[var(--color-text-muted)] max-w-2xl mx-auto leading-relaxed">
            Built for the way care teams actually work. Quick to build the schedule, easy to fill a
            gap, and right in your pocket on iOS and Android.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link href="/request-demo" className="dg-btn dg-btn-primary dg-btn-lg">
              Request Demo
              <ArrowRight size={18} />
            </Link>
            <a href="#features" className="dg-btn dg-btn-secondary dg-btn-lg">
              See Features
            </a>
          </div>
        </div>
      </section>

      {/* ── Schedule Grid Mockup ── */}
      <RevealSection className="-mt-10 pb-12 sm:pb-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="[perspective:1200px]">
            <div className="[transform:rotateX(2deg)] origin-bottom">
              <ScheduleGridMockup />
            </div>
          </div>
        </div>
      </RevealSection>

      {/* ── Bento Feature Grid ── */}
      <RevealSection id="features" className="py-16 sm:py-20 lg:py-24 bg-[var(--color-bg)]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
              Everything you need, nothing you don't
            </h2>
            <p className="mt-4 text-lg text-[var(--color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Made for the way care teams actually work.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface)] p-6 lg:p-8 hover:border-[var(--color-border)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-secondary)] flex items-center justify-center mb-4 group-hover:bg-[var(--color-border-light)] transition-colors duration-150">
                    <Icon
                      size={20}
                      className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-muted)] transition-colors duration-150"
                    />
                  </div>
                  <h3 className="text-base font-semibold text-[var(--color-text-secondary)] mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </RevealSection>

      {/* ── Dashboard Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
              The full picture
            </h2>
            <p className="mt-4 text-lg text-[var(--color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Coverage, hours, and open shifts on one screen. Catch a gap before it catches you.
            </p>
          </div>
          <DashboardMockup />
        </div>
      </RevealSection>

      {/* ── Settings Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20 bg-[var(--color-bg)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
              Make it your own
            </h2>
            <p className="mt-4 text-lg text-[var(--color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Rename focus areas, certifications, and roles so the app speaks the same language as
              your team.
            </p>
          </div>
          <SettingsMockup />
        </div>
      </RevealSection>

      {/* ── Recurring Shifts Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
              Set it once.
            </h2>
            <p className="mt-4 text-lg text-[var(--color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Set each person's usual weekly shifts, then apply the template across any date range
              in a click.
            </p>
          </div>
          <RecurringShiftsMockup />
        </div>
      </RevealSection>

      {/* ── Staff View Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20 bg-[var(--color-bg)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
              Your whole team, one screen
            </h2>
            <p className="mt-4 text-lg text-[var(--color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Certifications, focus areas, and account status. Filter to whoever you need, sorted by
              name or seniority.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <StaffViewMockup />
          </div>
        </div>
      </RevealSection>

      {/* ── Mobile App Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20 bg-[var(--color-bg)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
              Your schedule, in your pocket
            </h2>
            <p className="mt-4 text-lg text-[var(--color-text-muted)] max-w-xl mx-auto leading-relaxed">
              Check the week, swap a shift, or grab an open shift right from your phone. Native iOS
              and Android.
            </p>
          </div>
          <div className="flex justify-center">
            <MobileAppMockup />
          </div>
        </div>
      </RevealSection>

      {/* ── CTA ──
          Background sits on its own layer (not the section's own bg) since
          dark mode swaps the flat brand-blue fill for a gradient sweep
          (--color-cta-shell-bg), and Tailwind's arbitrary-value bg utility
          only sets background-color — it can't hold a gradient value. */}
      <RevealSection className="py-16 sm:py-20 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: "var(--color-cta-shell-bg)" }} />
        {/* Grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
            Done with
            <br />
            the spreadsheet?
          </h2>
          <p className="text-lg text-white/60 mt-4 max-w-xl mx-auto">
            Your team deserves something that just works.
          </p>
          <Link href="/request-demo" className="mt-8 dg-btn dg-btn-on-brand-solid dg-btn-lg">
            Request Demo
            <ArrowRight size={18} />
          </Link>
        </div>
      </RevealSection>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--color-border-light)]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <a
            href={
              typeof window !== "undefined"
                ? `${window.location.protocol}//${buildSubdomainHost("gridmaster", parseHost(window.location.host))}/login`
                : "/login"
            }
            className="flex items-center gap-2.5"
          >
            <DubGridLogo size={20} color="var(--color-text-faint)" />
            <span className="text-xs text-[var(--color-text-faint)]">
              &copy; {new Date().getFullYear()} DubGrid
            </span>
          </a>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors"
            >
              Terms of Service
            </Link>
            <Button
              type="button"
              onClick={openConsentPreferences}
              className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors"
            >
              Cookie preferences
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
