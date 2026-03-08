"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { buildSubdomainHost, isApexHost, parseHost } from "@/lib/subdomain";

/* ─── Sign-in modal steps ─── */
type SignInStep = "domain" | "credentials";

function SignInModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<SignInStep>("domain");
  const [isApex, setIsApex] = useState(true);
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDomainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const slug = domain.trim().toLowerCase();
    if (!slug) {
      setError("Please enter your workspace domain.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/validate-domain?slug=${encodeURIComponent(slug)}`,
      );
      const json = await res.json();
      if (json.valid) {
        const parsed = parseHost(window.location.host);
        const targetHost = buildSubdomainHost(slug, parsed);
        const targetUrl = `${window.location.protocol}//${targetHost}/?signin=1`;
        window.location.assign(targetUrl);
      } else {
        setError(
          "We couldn't find that workspace. Check the domain and try again.",
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authErr) {
      setError(authErr.message);
      setLoading(false);
    } else {
      router.replace("/schedule");
    }
  };

  useEffect(() => {
    const parsed = parseHost(window.location.host);
    const onApex = isApexHost(parsed);
    setIsApex(onApex);
    if (!onApex && parsed.subdomain) {
      setDomain(parsed.subdomain);
      setStep("credentials");
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="modal-header">
          <DubGridLogo size={36} />
          <DubGridWordmark fontSize={22} />
        </div>

        {step === "domain" && isApex ? (
          <form onSubmit={handleDomainSubmit} className="modal-form">
            <p className="modal-subtitle">
              Enter your workspace domain to get started.
            </p>
            <div className="input-group">
              <label className="input-label">Workspace Domain</label>
              <div className="domain-input-wrap">
                <input
                  type="text"
                  value={domain}
                  onChange={(e) =>
                    setDomain(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))
                  }
                  placeholder="your-facility"
                  className="text-input domain-input"
                  autoFocus
                  required
                />
                <span className="domain-suffix">.dubgrid.com</span>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignIn} className="modal-form">
            {isApex && (
              <button
                type="button"
                className="back-link"
                onClick={() => {
                  setStep("domain");
                  setError(null);
                }}
              >
                ← Back
              </button>
            )}
            <p className="modal-subtitle">
              Sign in to <strong>{domain.toLowerCase()}.dubgrid.com</strong>
            </p>
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="text-input"
                autoFocus
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="text-input"
                required
              />
            </div>
            {error && <div className="form-error">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── Features data ─── */
const FEATURES = [
  {
    icon: "📋",
    title: "One-Click Scheduling",
    desc: "Build shift schedules in minutes, not hours. Drag, drop, done — no formulas required.",
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
  const [showSignIn, setShowSignIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
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
        router.replace("/schedule");
      } else {
        setReady(true);
      }
    };
    const params = new URLSearchParams(window.location.search);
    if (params.get("signin") === "1") {
      setShowSignIn(true);
    }
    checkSession();
  }, [router]);

  const openSignIn = useCallback(() => setShowSignIn(true), []);
  const closeSignIn = useCallback(() => setShowSignIn(false), []);

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
            <DubGridLogo size={32} color="#1B3A2D" />
            <DubGridWordmark fontSize={20} color="#1B3A2D" />
          </div>
          <button className="btn-signin" onClick={openSignIn}>
            Sign In
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-badge">Staff Scheduling, Reimagined</div>
          <h1 className="hero-title">
            Stop scheduling with
            <br />
            <span className="hero-strike">spreadsheets</span>
          </h1>
          <p className="hero-subtitle">
            DubGrid replaces Google Sheets and Excel with a purpose-built
            platform for care facility scheduling — faster to use, easier to
            manage, and impossible to accidentally break.
          </p>
          <div className="hero-actions">
            <button className="btn-hero-primary" onClick={openSignIn}>
              Get Started
            </button>
            <a href="#features" className="btn-hero-secondary">
              See How It Works ↓
            </a>
          </div>
        </div>
      </section>

      {/* ── Pain Points ── */}
      <section className="comparison" id="why">
        <div className="section-inner">
          <h2 className="section-title">Why teams are switching</h2>
          <p className="section-subtitle">
            Spreadsheets were built for numbers, not shift schedules. Here's
            what changes when you move to DubGrid.
          </p>
          <div className="comparison-grid">
            <div className="comparison-col comparison-col--before">
              <div className="comparison-header">❌&ensp;Spreadsheets</div>
              {PAIN_POINTS.map((p, i) => (
                <div key={i} className="comparison-item">
                  {p.before}
                </div>
              ))}
            </div>
            <div className="comparison-col comparison-col--after">
              <div className="comparison-header">✅&ensp;DubGrid</div>
              {PAIN_POINTS.map((p, i) => (
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
            {FEATURES.map((f, i) => (
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
          <button className="btn-hero-primary" onClick={openSignIn}>
            Sign In to Your Workspace
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="nav-inner footer-inner">
          <div className="nav-brand" style={{ opacity: 0.6 }}>
            <DubGridLogo size={24} color="#64748B" />
            <DubGridWordmark fontSize={16} color="#64748B" />
          </div>
          <span className="footer-copy">
            © {new Date().getFullYear()} DubGrid. All rights reserved.
          </span>
        </div>
      </footer>

      {showSignIn && <SignInModal onClose={closeSignIn} />}

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
          padding: 8px 20px;
          border-radius: 8px;
          background: #1B3A2D;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s;
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
          padding: 14px 32px;
          border-radius: 10px;
          background: #1B3A2D;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
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

        /* ── Sign-in modal ── */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: fadeIn 0.2s ease-out;
        }
        .modal-card {
          position: relative;
          background: #fff;
          border-radius: 16px;
          padding: 40px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 24px 48px rgba(0,0,0,0.12);
          animation: slideUp 0.25s ease-out;
        }
        .modal-close {
          position: absolute;
          top: 16px; right: 16px;
          background: none;
          border: none;
          font-size: 18px;
          color: #94A3B8;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          transition: background 0.15s;
        }
        .modal-close:hover { background: #F1F5F9; color: #475569; }
        .modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
        }
        .modal-subtitle {
          font-size: 15px;
          color: #64748B;
          margin: 0 0 24px;
          line-height: 1.5;
        }
        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .input-label {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
        }
        .text-input {
          padding: 11px 14px;
          border-radius: 8px;
          border: 1px solid #E2E8F0;
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          width: 100%;
        }
        .text-input:focus {
          border-color: #1B3A2D;
          box-shadow: 0 0 0 3px rgba(27,58,45,0.08);
        }
        .domain-input-wrap {
          display: flex;
          align-items: center;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .domain-input-wrap:focus-within {
          border-color: #1B3A2D;
          box-shadow: 0 0 0 3px rgba(27,58,45,0.08);
        }
        .domain-input {
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          flex: 1;
        }
        .domain-suffix {
          padding: 0 14px;
          font-size: 14px;
          color: #94A3B8;
          font-weight: 500;
          white-space: nowrap;
          background: #F8FAFC;
          height: 100%;
          display: flex;
          align-items: center;
          border-left: 1px solid #E2E8F0;
        }
        .btn-primary {
          padding: 12px;
          border-radius: 8px;
          background: #1B3A2D;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s;
          margin-top: 4px;
        }
        .btn-primary:hover { opacity: 0.88; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .form-error {
          color: #DC2626;
          font-size: 13px;
          background: #FEF2F2;
          padding: 10px 14px;
          border-radius: 8px;
        }
        .back-link {
          background: none;
          border: none;
          color: #64748B;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          text-align: left;
          margin-bottom: -4px;
        }
        .back-link:hover { color: #0F172A; }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .features-grid { grid-template-columns: 1fr; }
          .comparison-grid { grid-template-columns: 1fr; }
          .hero { padding: 130px 20px 72px; }
        }
        @media (max-width: 480px) {
          .modal-card { padding: 28px 24px; }
          .hero-actions { flex-direction: column; align-items: center; }
        }
      `}</style>
    </div>
  );
}
