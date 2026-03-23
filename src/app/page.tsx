"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { buildSubdomainHost, isApexHost, parseHost } from "@/lib/subdomain";
import ScheduleGridMockup from "@/components/landing/ScheduleGridMockup";
import StaffViewMockup from "@/components/landing/StaffViewMockup";
import SettingsMockup from "@/components/landing/SettingsMockup";
import PermissionsMockup from "@/components/landing/PermissionsMockup";
import RecurringShiftsMockup from "@/components/landing/RecurringShiftsMockup";
import {
  CalendarDays,
  Users,
  Shield,
  Repeat,
  Settings,
  Radio,
  BarChart3,
  Mail,
  FileText,
  Building2,
  Lock,
  Menu,
  X,
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
    title: "Schedule Management",
    description:
      "Drag-and-drop shift grid with a draft-to-publish workflow. Week and month views with print-ready exports.",
  },
  {
    icon: Users,
    title: "Staff Management",
    description:
      "Employee records, certifications, focus areas, and status tracking — all in one place.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description:
      "Super admin, admin with configurable permissions, and user roles. Everyone sees exactly what they need.",
  },
  {
    icon: Radio,
    title: "Real-Time Collaboration",
    description:
      "Live schedule updates and presence indicators. Changes are visible the moment they happen.",
  },
  {
    icon: BarChart3,
    title: "Coverage Intelligence",
    description:
      "Shift counts, gap detection, focus area filtering, and color-coded shift types at a glance.",
  },
  {
    icon: Repeat,
    title: "Recurring Shifts",
    description:
      "Daily, weekly, and biweekly templates with full series management.",
  },
  {
    icon: Settings,
    title: "Customizable Terminology",
    description:
      "Rename focus areas, certifications, roles, and shift codes to match your facility.",
  },
  {
    icon: Mail,
    title: "Invite-Only Onboarding",
    description:
      "Secure invitation flow with 72-hour expiry. No open registration, no unauthorized access.",
  },
];

const TRUST_SIGNALS = [
  {
    icon: Shield,
    title: "Role-Based Access Control",
    description:
      "Granular permissions at every level. Admins, schedulers, and staff each see only what they need.",
  },
  {
    icon: FileText,
    title: "Immutable Audit Trail",
    description:
      "Every role change and schedule version is logged. Full accountability, zero ambiguity.",
  },
  {
    icon: Lock,
    title: "Invite-Only Access",
    description:
      "No open registration. Every user enters through a secure, time-limited invitation.",
  },
  {
    icon: Building2,
    title: "Multi-Organization",
    description:
      "Built from the ground up to scale. Each facility gets its own isolated workspace with dedicated subdomain routing.",
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
      className={`transition-all duration-700 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </section>
  );
}

/* ─── Main Page ───────────────────────────────────────── */

export default function RootPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /* Session redirect — preserved exactly */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsSignIn = params.get("signin") === "1";
    if (wantsSignIn) {
      router.replace("/login");
      return;
    }

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          const parsed = parseHost(window.location.host);
          if (isApexHost(parsed)) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("organizations(slug)")
              .eq("id", session.user.id)
              .maybeSingle();

            const slug = (
              profile as {
                organizations?: { slug?: string | null } | null;
              } | null
            )?.organizations?.slug;
            if (slug) {
              const host = buildSubdomainHost(slug, parsed);
              window.location.replace(
                `${window.location.protocol}//${host}/schedule`,
              );
              return;
            }
          }
          window.location.replace("/schedule");
        } else {
          setReady(true);
        }
      } catch {
        setReady(true);
      }
    };
    checkSession();
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
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--color-border)",
            borderTopColor: "var(--color-brand)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-slate-950 font-sans overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-surface)]/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <DubGridLogo size={28} color="var(--color-brand)" />
            <DubGridWordmark fontSize={18} color="var(--color-brand)" />
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              Features
            </a>
            <a
              href="#security"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              Security
            </a>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="hidden sm:inline-flex px-5 py-2 rounded-full bg-[var(--color-brand)] text-white text-sm font-semibold hover:bg-[var(--color-brand-light)] transition-colors"
            >
              Sign In
            </Link>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -mr-2 text-[var(--color-text-muted)] hover:text-slate-900 transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Menu Overlay ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-[var(--color-surface)]/95 backdrop-blur-xl flex flex-col">
          <div className="flex items-center justify-between px-6 h-14">
            <div className="flex items-center gap-2.5">
              <DubGridLogo size={28} color="var(--color-brand)" />
              <DubGridWordmark fontSize={18} color="var(--color-brand)" />
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 -mr-2 text-[var(--color-text-muted)] hover:text-slate-900 transition-colors"
              aria-label="Close menu"
            >
              <X size={22} />
            </button>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 gap-8">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-2xl font-semibold text-slate-900 hover:text-[var(--color-brand)] transition-colors"
            >
              Features
            </a>
            <a
              href="#security"
              onClick={() => setMobileMenuOpen(false)}
              className="text-2xl font-semibold text-slate-900 hover:text-[var(--color-brand)] transition-colors"
            >
              Security
            </a>
            <Link
              href="/login"
              className="mt-4 px-8 py-3 rounded-full bg-[var(--color-brand)] text-white text-lg font-semibold hover:bg-[var(--color-brand-light)] transition-colors"
            >
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
              background:
                "radial-gradient(circle, var(--color-brand) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.03]"
            style={{
              background:
                "radial-gradient(circle, #3B82F6 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.02]"
            style={{
              background:
                "radial-gradient(circle, var(--color-brand) 0%, transparent 60%)",
            }}
          />
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center pt-28 pb-14">
          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] text-slate-950 leading-[1.05]">
            Purpose built for
            <br />
            <span className="text-[var(--color-brand)]">CS Care Facilities</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
            DubGrid replaces spreadsheets with a purpose-built scheduling
            platform. Faster to use, easier to manage, impossible to break.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-[var(--color-brand)] text-white font-semibold text-base hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200"
            >
              Get Started
              <ArrowRight size={18} className="ml-2" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-full border border-slate-200 text-[var(--color-text-secondary)] font-semibold text-base hover:border-slate-400 transition-colors duration-200"
            >
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
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-slate-950">
              Everything you need
            </h2>
            <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
              Built specifically for care facilities that need reliable,
              role-aware scheduling.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group rounded-2xl border border-slate-100 bg-[var(--color-surface)] p-6 lg:p-8 hover:border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                  style={{ transitionDelay: `${i * 75}ms` }}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-4 group-hover:bg-[var(--color-brand)]/10 transition-colors duration-300">
                    <Icon
                      size={20}
                      className="text-[var(--color-text-muted)] group-hover:text-[var(--color-brand)] transition-colors duration-300"
                    />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}

          </div>
        </div>
      </RevealSection>

      {/* ── Settings Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-slate-950">
              Make it yours
            </h2>
            <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
              Rename focus areas, certifications, and roles to match how your facility actually works.
            </p>
          </div>
          <SettingsMockup />
        </div>
      </RevealSection>

      {/* ── Recurring Shifts Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20 bg-[var(--color-bg)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-slate-950">
              Automate the routine
            </h2>
            <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
              Set recurring shift templates and apply them in one click. Daily, weekly, or biweekly.
            </p>
          </div>
          <RecurringShiftsMockup />
        </div>
      </RevealSection>

      {/* ── Staff View Mockup ── */}
      <RevealSection className="py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-slate-950">
              Your team, at a glance
            </h2>
            <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
              Certifications, focus areas, and account status — all in one unified view.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <StaffViewMockup />
          </div>
        </div>
      </RevealSection>

      {/* ── Security & Trust ── */}
      <RevealSection
        id="security"
        className="py-16 sm:py-20 lg:py-24"
      >
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] text-slate-950">
              Built for trust
            </h2>
            <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
              Enterprise-grade security without the enterprise complexity.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-10 items-start">
            {/* Trust signal cards */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {TRUST_SIGNALS.map((signal) => {
                const Icon = signal.icon;
                return (
                  <div
                    key={signal.title}
                    className="p-6 rounded-2xl bg-[var(--color-surface)] border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Icon size={18} className="text-[var(--color-text-muted)]" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900">
                        {signal.title}
                      </h3>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      {signal.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Permissions mockup */}
            <div className="w-full lg:w-auto lg:shrink-0">
              <PermissionsMockup />
            </div>
          </div>
        </div>
      </RevealSection>

      {/* ── CTA ── */}
      <RevealSection className="py-16 sm:py-20 lg:py-24 bg-[var(--color-brand)] relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
            Ready to leave
            <br />
            spreadsheets behind?
          </h2>
          <p className="text-lg text-white/60 mt-4 max-w-xl mx-auto">
            Your team deserves a scheduling tool that just works.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 rounded-full bg-[var(--color-surface)] text-[var(--color-brand)] font-semibold text-base hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          >
            Get Started
            <ArrowRight size={18} />
          </Link>
        </div>
      </RevealSection>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <DubGridLogo size={20} color="#94A3B8" />
            <span className="text-xs text-slate-400">
              &copy; {new Date().getFullYear()} DubGrid
            </span>
          </div>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="text-xs text-slate-400 hover:text-[var(--color-text-muted)] transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-slate-400 hover:text-[var(--color-text-muted)] transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
