"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const ORG_SIZE_OPTIONS = ["1-25", "26-50", "51-100", "101-250", "250+"];

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--dg-fs-label)",
  fontWeight: 600,
  marginBottom: "6px",
  color: "var(--color-text-secondary)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  border: "1.5px solid var(--color-border)",
  borderRadius: "8px",
  fontSize: "var(--dg-fs-body)",
  background: "var(--color-bg)",
  color: "var(--color-text-primary)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function RequestDemoPage() {
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSize, setOrgSize] = useState("");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!contactName.trim() || !email.trim() || !orgName.trim() || !orgSize) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/request-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: contactName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          orgName: orgName.trim(),
          orgSize,
          industry: industry.trim(),
          message: message.trim(),
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else if (res.status === 429) {
        toast.error("Too many requests. Please try again later.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        padding: "24px 16px",
      }}
    >
      {submitted ? (
        /* ── Success state ──────────────────────────────────────────────── */
        <div
          style={{
            background: "var(--color-bg)",
            borderRadius: "20px",
            padding: "48px 40px",
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(15,23,42,0.08)",
          }}
        >
          <CheckCircle2
            size={48}
            style={{ color: "#22c55e", marginBottom: "16px", margin: "0 auto 16px" }}
          />
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: "0 0 12px",
              letterSpacing: "-0.02em",
            }}
          >
            Demo Request Submitted
          </h1>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              margin: "0 0 32px",
            }}
          >
            Thanks, {contactName}! We&apos;ll review your request and get back
            to you shortly.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "13px 32px",
              background: "var(--color-brand)",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              fontSize: "var(--dg-fs-body)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={16} />
            Back to Home
          </Link>
        </div>
      ) : (
        /* ── Form ───────────────────────────────────────────────────────── */
        <div
          style={{
            background: "var(--color-bg)",
            borderRadius: "20px",
            padding: "40px 36px",
            maxWidth: "540px",
            width: "100%",
            boxShadow: "0 4px 24px rgba(15,23,42,0.08)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "32px",
            }}
          >
            <Link
              href="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "var(--color-text-secondary)",
                textDecoration: "none",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 500,
              }}
            >
              <ArrowLeft size={16} />
              Back
            </Link>
            <div
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <DubGridLogo size={28} />
              <DubGridWordmark fontSize={16} />
            </div>
          </div>

          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: "0 0 6px",
              letterSpacing: "-0.02em",
            }}
          >
            Request a Demo
          </h1>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              color: "var(--color-text-secondary)",
              margin: "0 0 28px",
              lineHeight: 1.5,
            }}
          >
            Tell us about your organization and we&apos;ll be in touch.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {/* Contact Name */}
              <div>
                <label style={labelStyle}>
                  Contact Name{" "}
                  <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Your full name"
                  style={inputStyle}
                />
              </div>

              {/* Email + Phone row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>
                    Email{" "}
                    <span style={{ color: "var(--color-danger)" }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(optional)"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Organization Name */}
              <div>
                <label style={labelStyle}>
                  Organization Name{" "}
                  <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Your company or facility name"
                  style={inputStyle}
                />
              </div>

              {/* Org Size + Industry row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>
                    Employee Count{" "}
                    <span style={{ color: "var(--color-danger)" }}>*</span>
                  </label>
                  <select
                    required
                    value={orgSize}
                    onChange={(e) => setOrgSize(e.target.value)}
                    style={{
                      ...inputStyle,
                      appearance: "none",
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 12px center",
                      paddingRight: "36px",
                      color: orgSize ? "var(--color-text-primary)" : "var(--color-text-muted)",
                    }}
                  >
                    <option value="" disabled>
                      Select range
                    </option>
                    {ORG_SIZE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Industry / Facility Type</label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Residential Care"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <label style={labelStyle}>Anything else we should know?</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Tell us about your scheduling challenges, team size, or any questions..."
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: "80px",
                  }}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "28px",
                padding: "13px",
                background: loading
                  ? "var(--color-text-subtle)"
                  : "var(--color-brand)",
                color: "#fff",
                border: "none",
                borderRadius: "999px",
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s ease",
              }}
            >
              {loading ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          marginTop: "36px",
          display: "flex",
          gap: "4px",
          alignItems: "center",
          fontSize: "var(--dg-fs-label)",
          color: "var(--color-text-faint)",
        }}
      >
        <Link
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--color-text-faint)", textDecoration: "none" }}
        >
          Privacy Policy
        </Link>
        <span style={{ margin: "0 4px" }}>·</span>
        <Link
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--color-text-faint)", textDecoration: "none" }}
        >
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
