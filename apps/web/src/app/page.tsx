"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { SERVICE_STATUS_URL } from "@dubgrid/domain";
// @/features/account/client is imported dynamically inside the session effect —
// see the comment there. A static import here pulls the Supabase auth SDK into
// the landing page's initial bundle for visitors who are not signed in.
import { DubGridLockup, DubGridLogo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { BrandLoadingScreen } from "@/components/BrandLoadingScreen";
import { openConsentPreferences } from "@/components/CookieConsent";
import { CloseButton } from "@/components/ui/CloseButton";
import { buildSubdomainHost, isApexHost, parseHost } from "@/lib/subdomain";
import { withThemeParam } from "@/lib/theme-preference";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { HeroSchedulePreview } from "@/components/landing/HeroSchedulePreview";
import { HeroHomePhone } from "@/components/landing/HeroHomePhone";
import { AutoBuildDemo } from "@/components/landing/AutoBuildDemo";
import { OpenShiftDemo } from "@/components/landing/OpenShiftDemo";
import { SwapDemo } from "@/components/landing/SwapDemo";
import { OvertimeDemo } from "@/components/landing/OvertimeDemo";
import { AccessDemo } from "@/components/landing/AccessDemo";
import { SecurityCarousel } from "@/components/landing/SecurityCarousel";
import { Menu } from "lucide-react";
import "./landing-demos.css";

const NAV_SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "security", label: "Security" },
] as const;

/**
 * One story on the page: a problem as the heading, one line on how it goes
 * away, then its illustration. One column throughout, by design.
 */
function LandingSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="landing-section scroll-mt-14 py-14 sm:py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10 lg:mb-14">
          <h2 className="dg-font-brand-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-[var(--dg-color-text-primary)]">
            {title}
          </h2>
          <p className="mt-4 text-lg lg:text-xl text-[var(--dg-color-text-muted)] max-w-2xl mx-auto leading-relaxed">
            {description}
          </p>
        </div>
        {children}
      </div>
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

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  if (!ready) {
    return <BrandLoadingScreen animation="breathe" />;
  }

  return (
    <div className="landing-page min-h-dvh text-[var(--dg-color-text-primary)] font-sans overflow-x-hidden">
      <div className="landing-hero-gradient" aria-hidden="true" />
      {/* ── Navbar ── */}
      <nav className="landing-nav fixed top-0 left-0 right-0 z-50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <DubGridLockup fontSize={24} color="var(--dg-color-text-inverse)" markTone="onBrand" />
          </div>

          <div className="hidden md:flex items-center gap-1">
            {NAV_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="landing-nav-link rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              >
                {section.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggleButton onDarkSurface />
            <Link href="/login" prefetch={false} className="landing-nav-sign-in dg-btn dg-btn-lg">
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
              <DubGridLockup
                fontSize={24}
                color="var(--dg-color-text-inverse)"
                markTone="onBrand"
              />
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggleButton onDarkSurface />
              <CloseButton
                size="lg"
                className="landing-mobile-menu-close -mr-2"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <nav aria-label="Sections" className="flex flex-col items-center gap-2">
              {NAV_SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="landing-mobile-menu-link dg-font-brand-heading rounded-xl px-4 py-2 text-2xl font-semibold transition-colors"
                >
                  {section.label}
                </a>
              ))}
            </nav>
            <Link href="/login" prefetch={false} className="dg-btn dg-btn-primary dg-btn-lg">
              Sign In
            </Link>
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="landing-hero relative flex items-center justify-center overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 text-center pt-28 pb-28 sm:pb-32">
          <h1 className="dg-font-brand-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] text-white leading-[1.05]">
            Scheduling, done right.
            <br />
            <span className="text-white/80">Ditch the spreadsheet.</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-white/85 max-w-2xl mx-auto leading-relaxed">
            Stop chasing coverage by text and phone call. Keep every shift filled and everyone on
            the same page.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link href="/request-demo" className="landing-hero-primary dg-btn dg-btn-lg">
              Request Demo
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-hero-screenshot -mt-20 pb-6 sm:pb-10 lg:pb-28">
        <div className="landing-hero-stage max-w-[1248px] mx-auto px-6">
          <div className="landing-screenshot landing-screenshot-hero">
            <HeroSchedulePreview />
          </div>
          <div
            className="landing-hero-phone"
            role="img"
            aria-label="The app's Home in its Team view"
          >
            <HeroHomePhone />
          </div>
        </div>
      </section>

      <LandingSection
        id="how-it-works"
        title="Stop building schedules by hand"
        description="Hours of filling in shifts become a few minutes of checking."
      >
        <AutoBuildDemo />
      </LandingSection>

      <LandingSection
        title="Never get caught short-staffed"
        description="Know which shifts need people before they start, and who can fill them."
      >
        <OpenShiftDemo />
      </LandingSection>

      <LandingSection
        title="No more swap texts and sticky notes"
        description="Staff trade and give up shifts on their own. You just say yes or no, and whoever's shift changed hears about it."
      >
        <div className="landing-phones-trio">
          <SwapDemo />
        </div>
      </LandingSection>

      <LandingSection
        title="Catch overtime before it happens"
        description="See who's on track to pass 40 hours while there's still time to change the schedule."
      >
        <OvertimeDemo />
      </LandingSection>

      <LandingSection
        title="The right people make the right changes"
        description="Decide who can edit, publish and approve. Nobody changes what they shouldn't."
      >
        <AccessDemo />
      </LandingSection>

      <LandingSection
        id="security"
        title="Your team's information stays protected"
        description="Security that works quietly in the background."
      >
        <SecurityCarousel />
      </LandingSection>

      <section className="landing-cta-section px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div className="landing-cta max-w-5xl mx-auto px-6 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24 text-center">
          <h2 className="dg-font-brand-heading text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
            Done with
            <br />
            the spreadsheet?
          </h2>
          <p className="text-lg text-white/85 mt-4 max-w-xl mx-auto">
            Your team deserves something that just works.
          </p>
          <Link href="/request-demo" className="landing-hero-secondary mt-8 dg-btn dg-btn-lg">
            Request Demo
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--dg-color-border-light)]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <a href={gridmasterLoginHref} className="flex items-center gap-2.5">
            <DubGridLogo size={20} color="var(--dg-color-text-label)" />
            <span className="text-xs text-[var(--dg-color-text-label)]">
              &copy; {new Date().getFullYear()} DubGrid
            </span>
          </a>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 whitespace-nowrap">
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
            <a
              href={SERVICE_STATUS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[var(--dg-color-text-label)] hover:text-[var(--dg-color-text-primary)] transition-colors"
            >
              Status
            </a>
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
