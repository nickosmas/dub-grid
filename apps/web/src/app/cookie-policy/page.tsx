import type { Metadata } from "next";
import Link from "next/link";
import CookiePreferencesManager from "./CookiePreferencesManager";

export const revalidate = 86400; // 24 hours

export const metadata: Metadata = {
  title: "Cookie Policy | DubGrid",
};

const sectionHeading = {
  fontSize: "var(--dg-fs-heading)",
  fontWeight: 600,
  marginBottom: "12px",
  color: "var(--dg-color-text-secondary)",
} as const;

const bodyText = {
  fontSize: "var(--dg-fs-body)",
  lineHeight: 1.7,
  color: "var(--dg-color-text-secondary)",
} as const;

const tableCell = {
  padding: "10px 14px",
  fontSize: "var(--dg-fs-body-sm)",
  lineHeight: 1.5,
  color: "var(--dg-color-text-secondary)",
  borderBottom: "1px solid var(--dg-color-border)",
  verticalAlign: "top",
} as const;

const tableHeader = {
  ...tableCell,
  fontSize: "var(--dg-fs-label)",
  fontWeight: "var(--dg-type-table-heading-weight)",
  color: "var(--dg-color-text-label)",
  background: "var(--dg-color-surface-hover)",
} as const;

// Scope: written for the US market. Cookie categories and consent map to the
// CookieConsent banner (Accept all / Essential only / Customize).
export default function CookiePolicyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dg-color-surface)",
        fontFamily: "var(--font-sans)",
        color: "var(--dg-color-text-primary)",
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: "32px",
            color: "var(--dg-color-text-subtle)",
            fontSize: "var(--dg-fs-body-sm)",
            textDecoration: "none",
          }}
        >
          &larr; Back to DubGrid
        </Link>

        <h1
          style={{
            fontSize: "var(--dg-fs-page-title)",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Cookie Policy
        </h1>
        <p
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--dg-color-text-subtle)",
            marginBottom: "40px",
          }}
        >
          Last updated: September 2026
        </p>

        {/* Introduction */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={sectionHeading}>What Are Cookies</h2>
          <p style={bodyText}>
            Cookies are small text files stored on your device when you visit a website. They help
            the site remember your preferences and activity. DubGrid uses cookies to keep you signed
            in, remember your settings, and (with your consent) understand how the application is
            used so we can improve it.
          </p>
        </section>

        {/* How to manage */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={sectionHeading}>Managing Your Preferences</h2>
          <p style={{ ...bodyText, marginBottom: "16px" }}>
            When you first visit DubGrid, a consent banner lets you choose{" "}
            <strong>Accept all</strong>, <strong>Essential only</strong>, or{" "}
            <strong>Customize</strong> to set each category individually. You can change your choice
            at any time using the controls below, the <strong>Cookie preferences</strong> link in
            the site footer and in Profile, Privacy &amp; data, or by clearing cookies in your
            browser settings.
          </p>
          <CookiePreferencesManager />
        </section>

        {/* Essential cookies */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={sectionHeading}>Essential Cookies</h2>
          <p style={{ ...bodyText, marginBottom: "16px" }}>
            These cookies are strictly necessary for DubGrid to function. They cannot be disabled.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                border: "1px solid var(--dg-color-border)",
              }}
            >
              <thead>
                <tr>
                  <th style={tableHeader}>Cookie</th>
                  <th style={tableHeader}>Purpose</th>
                  <th style={tableHeader}>Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tableCell}>
                    <code>sb-*-auth-token</code>
                  </td>
                  <td style={tableCell}>
                    Authentication session managed by Supabase. Keeps you signed in and carries your
                    role and organization context.
                  </td>
                  <td style={tableCell}>Session / auto-refreshed</td>
                </tr>
                <tr>
                  <td style={tableCell}>
                    <code>dg_device</code>
                  </td>
                  <td style={tableCell}>
                    A random ID that recognizes a browser you&apos;ve signed in from before, so we
                    only email you about sign-ins from a new device. We keep only a scrambled copy
                    of it, and changing your password makes us forget every device.
                  </td>
                  <td style={tableCell}>400 days, renewed each time you sign in</td>
                </tr>
                <tr>
                  <td style={tableCell}>
                    <code>dubgrid-cookie-consent</code>
                  </td>
                  <td style={tableCell}>
                    Stores your cookie consent preference (essential only or all cookies).
                  </td>
                  <td style={tableCell}>1 year</td>
                </tr>
                <tr>
                  <td style={tableCell}>
                    <code>sidebar_state</code>
                  </td>
                  <td style={tableCell}>
                    Remembers whether the navigation sidebar is open or collapsed.
                  </td>
                  <td style={tableCell}>7 days</td>
                </tr>
                <tr>
                  <td style={tableCell}>
                    <code>dg-theme</code>
                  </td>
                  <td style={tableCell}>
                    Remembers your appearance preference (light, dark, or follow your device) so it
                    stays consistent across your organization&apos;s subdomain and the main site.
                  </td>
                  <td style={tableCell}>1 year</td>
                </tr>
                <tr>
                  <td style={tableCell}>
                    <code>dubgrid-impersonation</code>
                  </td>
                  <td style={tableCell}>
                    Used by platform administrators during support impersonation sessions. Only set
                    when an impersonation is active.
                  </td>
                  <td style={tableCell}>Up to 30 minutes</td>
                </tr>
                <tr>
                  <td style={tableCell}>
                    <code>dubgrid-sandbox</code>
                  </td>
                  <td style={tableCell}>
                    Marks an administrator&apos;s test-sandbox session so demo data stays separate
                    from live data. Only set when sandbox mode is active.
                  </td>
                  <td style={tableCell}>Session</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Analytics cookies */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={sectionHeading}>Analytics Cookies</h2>
          <p style={{ ...bodyText, marginBottom: "16px" }}>
            These technologies are enabled only if you choose &ldquo;Accept all&rdquo; in the
            consent banner or enable Analytics in its Customize view. They help us understand usage
            patterns so we can improve DubGrid.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                border: "1px solid var(--dg-color-border)",
              }}
            >
              <thead>
                <tr>
                  <th style={tableHeader}>Service</th>
                  <th style={tableHeader}>Purpose</th>
                  <th style={tableHeader}>Storage</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tableCell}>PostHog</td>
                  <td style={tableCell}>
                    Product analytics. Tracks page views and custom events (autocapture is
                    disabled). Data is associated with your user ID when you are signed in.
                  </td>
                  <td style={tableCell}>localStorage + cookie</td>
                </tr>
                <tr>
                  <td style={tableCell}>Vercel Analytics</td>
                  <td style={tableCell}>
                    Web performance metrics (Core Web Vitals) collected by our hosting provider.
                  </td>
                  <td style={tableCell}>Cookie-free page-view beacon</td>
                </tr>
                <tr>
                  <td style={tableCell}>Sentry Session Replay</td>
                  <td style={tableCell}>
                    Records a privacy-masked replay of a sample of sessions so we can reproduce
                    bugs. Only enabled with analytics consent; error monitoring (below) runs
                    separately and is always on.
                  </td>
                  <td style={tableCell}>localStorage</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Operational services */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={sectionHeading}>Operational Services</h2>
          <p style={{ ...bodyText, marginBottom: "16px" }}>
            The following service runs regardless of your cookie preference because it is necessary
            for the reliability of the application. It does not track browsing behavior or set
            analytics cookies. Sentry Session Replay is a separate, optional feature listed under
            Analytics Cookies above and only runs with your consent.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                border: "1px solid var(--dg-color-border)",
              }}
            >
              <thead>
                <tr>
                  <th style={tableHeader}>Service</th>
                  <th style={tableHeader}>Purpose</th>
                  <th style={tableHeader}>PII</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tableCell}>Sentry</td>
                  <td style={tableCell}>
                    Error monitoring and crash reporting. Captures stack traces and request context
                    when errors occur so we can fix bugs.
                  </td>
                  <td style={tableCell}>
                    For signed-in users, Sentry receives the user ID and email address to help us
                    investigate account-specific errors.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Third-party processors */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={sectionHeading}>Third-Party Data Processors</h2>
          <p style={bodyText}>
            The services above are provided by third-party companies that process data on our
            behalf:
          </p>
          <ul
            style={{
              ...bodyText,
              paddingLeft: "24px",
              marginTop: "12px",
            }}
          >
            <li style={{ marginBottom: "6px" }}>
              <strong>Supabase</strong> (authentication and database hosting)
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Vercel</strong> (application hosting and web analytics)
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>PostHog</strong> (product analytics, consent required)
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Sentry</strong> (error monitoring, always on; session replay, consent
              required)
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Stripe</strong> (payment processing, only during checkout)
            </li>
            <li style={{ marginBottom: "6px" }}>
              <strong>Google Maps Platform</strong> (loads in your browser only when an
              administrator uses address autocomplete in organization settings)
            </li>
          </ul>
          <p style={{ ...bodyText, marginTop: "12px" }}>
            We also use service providers that operate on the server and do not set cookies in your
            browser, such as Resend (transactional email) and Upstash (rate limiting). These are
            described in our{" "}
            <Link
              href="/privacy"
              style={{ color: "var(--dg-color-brand)", textDecoration: "underline" }}
            >
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        {/* Links */}
        <section style={{ marginBottom: "32px" }}>
          <h2 style={sectionHeading}>Related Policies and Contact</h2>
          <p style={bodyText}>
            For more information on how we handle your data, see our{" "}
            <Link
              href="/privacy"
              style={{
                color: "var(--dg-color-brand)",
                textDecoration: "underline",
              }}
            >
              Privacy Policy
            </Link>
            . DubGrid is operated by DubGrid LLC. Questions about cookies? Email us at{" "}
            <a
              href="mailto:support@dubgrid.com"
              style={{ color: "var(--dg-color-brand)", textDecoration: "underline" }}
            >
              support@dubgrid.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
