"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DubGridLogo, DubGridWordmark, OrgLogo } from "@/components/Logo";
import { buildSubdomainHost, isApexHost, parseHost } from "@/lib/subdomain";
import { Organization } from "@/types";
import * as db from "@/lib/db";

/* ─── Features data ─── */
const FEATURES = [
  {
    icon: "📋",
    title: "One-Click Scheduling",
    desc: "Build shift schedules in minutes, not hours. Click, assign, done — no formulas required.",
  },
  {
    icon: "👥",
    title: "Role-Based Access",
    desc: "Admins, schedulers, and staff each see exactly what they need. No oversharing, no confusion.",
  },
  {
    icon: "🔔",
    title: "Instant Visibility",
    desc: "Everyone sees the latest schedule the moment it's published. No more emailing spreadsheets.",
  },
  {
    icon: "🏥",
    title: "Built for Care Facilities",
    desc: "Wings, skill levels, shift types — DubGrid understands your world out of the box.",
  },
  {
    icon: "📊",
    title: "Coverage at a Glance",
    desc: "Real-time shift counts, gap detection, and print-ready views keep your floor covered.",
  },
  {
    icon: "🔒",
    title: "Draft → Publish Workflow",
    desc: "Tweak schedules privately before publishing. Staff only see what's final.",
  },
];

const PAIN_POINTS = [
  {
    before: "Emailing spreadsheets back and forth",
    after: "Single source of truth, always live",
  },
  {
    before: "Manual cell coloring in Google Sheets",
    after: "Shift types with built-in color coding",
  },
  {
    before: '"Who\'s covering Wing B tonight?"',
    after: "Filtered views by wing, role & date",
  },
  {
    before: "Version confusion across copies",
    after: "One schedule, versioned & auditable",
  },
  {
    before: "No access control on sensitive data",
    after: "Role-based permissions at every level",
  },
];

/* ─── Main Page ─── */
export default function RootPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);

  useEffect(() => {
    const host = window.location.host;
    const parsed = parseHost(host);
    
    // If not on apex, fetch the org for this subdomain
    if (!isApexHost(parsed) && parsed.subdomain) {
      db.fetchOrgBySlug(parsed.subdomain)
        .then(setOrganization)
        .catch(console.error);
    }

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
          router.replace("/schedule");
        } else {
          setReady(true);
        }
      } catch {
        setReady(true);
      }
    };
    checkSession();
  }, [router]);

  const appName = organization?.appName ?? "DubGrid";
  const logoUrl = organization?.logoUrl;
  
  const features = organization?.landingPageConfig?.features ?? FEATURES;
  const painPoints = organization?.landingPageConfig?.painPoints ?? PAIN_POINTS;
  const heroTitle = organization?.landingPageConfig?.heroTitle ?? (
    <>
      Stop scheduling with
      <br />
      <span className="hero-strike">spreadsheets</span>
    </>
  );
  const heroSubtitle = organization?.landingPageConfig?.heroSubtitle ?? (
    `${appName} replaces Google Sheets and Excel with a purpose-built platform for care facility scheduling — faster to use, easier to manage, and impossible to accidentally break.`
  );

  if (!ready) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="landing">
      {/* ── Navbar ── */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-brand">
            <OrgLogo logoUrl={logoUrl} size={32} appName={appName} />
            <DubGridWordmark fontSize={20} color="#1B3A2D" text={appName} />
          </div>
          <Link href="/login" className="btn-signin">
            Sign In
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-badge">Staff Scheduling, Reimagined</div>
          <h1 className="hero-title">
            {heroTitle}
          </h1>
          <p className="hero-subtitle">
            {heroSubtitle}
          </p>
          <div className="hero-actions">
            <Link href="/login" className="btn-hero-primary">
              Get Started
            </Link>
            <a href="#features" className="btn-hero-secondary">
              See How It Works ↓
            </a>
          </div>
        </div>
      </section>

      {/* ── Pain Points ── */}
      <section className="comparison" id="why">
        <div className="section-inner">
          <h2 className="section-title">Why you should switch</h2>
          <p className="section-subtitle">
            Spreadsheets were built for numbers, not shift schedules. Here's
            what changes when you move to DubGrid.
          </p>
          <div className="comparison-grid">
            <div className="comparison-col comparison-col--before">
              <div className="comparison-header">❌&ensp;Spreadsheets</div>
              {painPoints.map((p, i) => (
                <div key={i} className="comparison-item">
                  {p.before}
                </div>
              ))}
            </div>
            <div className="comparison-col comparison-col--after">
              <div className="comparison-header">✅&ensp;{appName}</div>
              {painPoints.map((p, i) => (
                <div key={i} className="comparison-item">
                  {p.after}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="features" id="features">
        <div className="section-inner">
          <h2 className="section-title">
            Everything you need, nothing you don't
          </h2>
          <p className="section-subtitle">
            Built specifically for care facilities that need reliable,
            role-aware scheduling — without the overhead of a bloated enterprise
            tool.
          </p>
          <div className="features-grid">
            {features.map((f, i) => (
              <div key={i} className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta">
        <div className="section-inner cta-inner">
          <h2 className="cta-title">Ready to leave the spreadsheet behind?</h2>
          <p className="cta-subtitle">
            Your team deserves a scheduling tool that just works.
          </p>
          <Link href="/login" className="btn-hero-primary">
            Sign In to Your Workspace
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="nav-inner footer-inner">
          <div className="nav-brand" style={{ opacity: 0.6 }}>
            <OrgLogo logoUrl={logoUrl} size={24} appName={appName} />
            <DubGridWordmark fontSize={16} color="#64748B" text={appName} />
          </div>
          <span className="footer-copy">
            © {new Date().getFullYear()} {appName}. All rights reserved.
          </span>
        </div>
      </footer>

      {/* ─── Scoped styles ─── */}
      <style>{`
        /* ── Reset & base ── */
        .landing {
          min-height: 100vh;
          background: #FFFFFF;
          color: #0F172A;
          font-family: var(--font-dm-sans), 'DM Sans', system-ui, sans-serif;
          overflow-x: hidden;
        }

        /* ── Loading ── */
        .loading-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #F8FAFC;
        }
        .spinner {
          width: 32px; height: 32px;
          border: 3px solid #E2E8F0;
          border-top-color: #1B3A2D;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Nav ── */
        .nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #F1F5F9;
        }
        .nav-inner {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 24px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .nav-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .btn-signin {
          display: inline-block;
          padding: 8px 20px;
          border-radius: 8px;
          background: #1B3A2D;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s;
          text-decoration: none;
        }
        .btn-signin:hover { opacity: 0.88; }

        /* ── Hero ── */
        .hero {
          padding: 160px 24px 100px;
          text-align: center;
          background: linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%);
        }
        .hero-inner { max-width: 720px; margin: 0 auto; }
        .hero-badge {
          display: inline-block;
          font-size: 13px;
          font-weight: 700;
          color: #2563EB;
          background: #EFF6FF;
          padding: 6px 16px;
          border-radius: 100px;
          margin-bottom: 24px;
          letter-spacing: 0.02em;
        }
        .hero-title {
          font-size: clamp(36px, 5vw, 56px);
          font-weight: 800;
          line-height: 1.1;
          margin: 0 0 24px;
          color: #0F172A;
          letter-spacing: -0.03em;
        }
        .hero-strike {
          text-decoration: line-through;
          text-decoration-color: #EF4444;
          text-decoration-thickness: 3px;
          color: #94A3B8;
        }
        .hero-subtitle {
          font-size: 18px;
          line-height: 1.7;
          color: #475569;
          margin: 0 0 40px;
          max-width: 580px;
          margin-left: auto;
          margin-right: auto;
        }
        .hero-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .btn-hero-primary {
          display: inline-block;
          padding: 14px 32px;
          border-radius: 10px;
          background: #1B3A2D;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          text-decoration: none;
        }
        .btn-hero-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(27,58,45,0.25);
        }
        .btn-hero-secondary {
          padding: 14px 32px;
          border-radius: 10px;
          background: transparent;
          color: #1B3A2D;
          font-size: 16px;
          font-weight: 600;
          border: 2px solid #E2E8F0;
          cursor: pointer;
          text-decoration: none;
          transition: border-color 0.2s;
        }
        .btn-hero-secondary:hover { border-color: #94A3B8; }

        /* ── Section shared ── */
        .section-inner {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .section-title {
          font-size: clamp(26px, 3.5vw, 36px);
          font-weight: 800;
          text-align: center;
          margin: 0 0 12px;
          letter-spacing: -0.02em;
        }
        .section-subtitle {
          font-size: 17px;
          color: #64748B;
          text-align: center;
          max-width: 560px;
          margin: 0 auto 48px;
          line-height: 1.6;
        }

        /* ── Comparison ── */
        .comparison {
          padding: 100px 24px;
          background: #F8FAFC;
        }
        .comparison-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          max-width: 800px;
          margin: 0 auto;
        }
        .comparison-col {
          border-radius: 14px;
          overflow: hidden;
        }
        .comparison-col--before { background: #FEF2F2; }
        .comparison-col--after  { background: #F0FDF4; }
        .comparison-header {
          padding: 16px 20px;
          font-size: 15px;
          font-weight: 700;
        }
        .comparison-col--before .comparison-header { color: #991B1B; background: #FEE2E2; }
        .comparison-col--after  .comparison-header { color: #166534; background: #DCFCE7; }
        .comparison-item {
          padding: 14px 20px;
          font-size: 14px;
          line-height: 1.5;
          color: #334155;
          border-top: 1px solid rgba(0,0,0,0.06);
        }

        /* ── Features ── */
        .features {
          padding: 100px 24px;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        .feature-card {
          padding: 32px 28px;
          border-radius: 14px;
          border: 1px solid #F1F5F9;
          background: #FAFBFC;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .feature-card:hover {
          box-shadow: 0 8px 30px rgba(0,0,0,0.06);
          transform: translateY(-2px);
        }
        .feature-icon { font-size: 28px; display: block; margin-bottom: 16px; }
        .feature-title {
          font-size: 17px;
          font-weight: 700;
          margin: 0 0 8px;
          color: #0F172A;
        }
        .feature-desc {
          font-size: 14px;
          line-height: 1.6;
          color: #64748B;
          margin: 0;
        }

        /* ── CTA ── */
        .cta {
          padding: 100px 24px;
          background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
          text-align: center;
        }
        .cta-inner { display: flex; flex-direction: column; align-items: center; }
        .cta-title {
          font-size: clamp(26px, 3.5vw, 36px);
          font-weight: 800;
          color: #fff;
          margin: 0 0 12px;
          letter-spacing: -0.02em;
        }
        .cta-subtitle {
          font-size: 17px;
          color: #94A3B8;
          margin: 0 0 32px;
        }
        .cta .btn-hero-primary {
          background: #fff;
          color: #0F172A;
          text-decoration: none;
        }
        .cta .btn-hero-primary:hover {
          box-shadow: 0 6px 24px rgba(255,255,255,0.2);
        }

        /* ── Footer ── */
        .footer {
          border-top: 1px solid #F1F5F9;
          padding: 24px 0;
        }
        .footer-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .footer-copy {
          font-size: 13px;
          color: #94A3B8;
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .features-grid { grid-template-columns: 1fr; }
          .comparison-grid { grid-template-columns: 1fr; }
          .hero { padding: 130px 20px 72px; }
        }
        @media (max-width: 480px) {
          .hero-actions { flex-direction: column; align-items: center; }
        }
      `}</style>
    </div>
  );
}
