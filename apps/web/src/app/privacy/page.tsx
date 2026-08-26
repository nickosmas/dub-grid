import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 86400; // 24 hours

export const metadata: Metadata = {
  title: "Privacy Policy | DubGrid",
};

// Scope: written for the US market (CCPA/CPRA + general US best practice).
// If DubGrid begins serving EU/UK users, GDPR/UK GDPR sections (legal bases,
// international transfers, data-subject rights, Art. 27 representative) must be added.
export default function PrivacyPolicyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dg-color-surface)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
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
          ← Back to DubGrid
        </Link>

        <h1
          style={{
            fontSize: "var(--dg-fs-page-title)",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Privacy Policy
        </h1>
        <p
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--dg-color-text-subtle)",
            marginBottom: "40px",
          }}
        >
          Last updated: May 2026
        </p>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            1. Introduction
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            DubGrid LLC (&ldquo;DubGrid,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or
            &ldquo;us&rdquo;) operates a multi-tenant staff scheduling platform for care facilities.
            This Privacy Policy explains how we collect, use, store, and protect information when
            you use our web and mobile applications and related services (the
            &ldquo;Service&rdquo;). By using DubGrid, you agree to the practices described in this
            policy.
          </p>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginTop: "12px",
            }}
          >
            The Service is intended for organizations and staff located in the United States. We are
            not directed at, and do not knowingly offer the Service to, individuals in the European
            Union or United Kingdom.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            2. Information We Collect
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginBottom: "16px",
            }}
          >
            We collect information necessary to provide the Service and to manage your
            organization&apos;s schedules and staff.
          </p>
          <ul
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              paddingLeft: "24px",
              marginBottom: "16px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              <strong>Account and authentication.</strong> When you sign up or sign in, we collect
              your email address and password (stored in encrypted form). We may also store your
              first and last name when you provide it or when it is derived from your account
              profile.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Profile and role data.</strong> We store your association with an
              organization, your role (e.g., admin, scheduler, supervisor, or staff), and
              platform-level role if applicable. This allows us to enforce access control and show
              you the appropriate features and data.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Organization data.</strong> For each organization (tenant), we store the
              organization name, subdomain identifier, and optional contact information such as
              address and phone number that administrators may configure.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Employee roster data.</strong> Organizations use DubGrid to manage staff
              rosters. This may include employee names, designations, roles, focus area assignments,
              seniority, FTE weight, and optional contact information (phone, email, contact notes)
              that your organization chooses to store in the system.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Schedule and shift data.</strong> We store shift assignments (which employee
              is assigned which shift and job on which date), draft and published schedule states,
              and any schedule or shift notes (e.g., readings, shower notes) that authorized users
              add.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Invitation data.</strong> When an administrator invites a user to join an
              organization, we store the invitee&apos;s email address, the role to be assigned, and
              the invitation status and expiry.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Technical and usage data.</strong> Our infrastructure (including
              authentication and database hosting) may log technical data such as IP address,
              browser type, and request metadata to operate and secure the Service.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Analytics data (with consent).</strong> If you accept analytics cookies, we
              use PostHog and Vercel Analytics to collect anonymized usage data such as page views
              and performance metrics. This data is not collected until you provide consent. See our{" "}
              <Link
                href="/cookie-policy"
                style={{ color: "var(--dg-color-brand)", textDecoration: "underline" }}
              >
                Cookie Policy
              </Link>{" "}
              for details.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Error reports.</strong> We use Sentry for error monitoring. When an error
              occurs, technical context (stack traces, request metadata) is captured to help us
              diagnose issues. Personally identifiable information is not included in error reports.
              Sentry also offers session replay, which we enable only with your analytics consent.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            3. How We Use Your Information
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginBottom: "16px",
            }}
          >
            We use the information we collect to:
          </p>
          <ul
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              paddingLeft: "24px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              Provide, maintain, and improve the scheduling and roster features of the Service.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Authenticate you and enforce role-based access so that users only see and edit data
              they are permitted to access.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Isolate each organization&apos;s data (multi-tenant isolation) so that one
              organization cannot access another&apos;s data.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Send transactional email such as invitations, email verification, password resets, and
              account notifications.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Process subscription payments and manage billing for paid plans.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Protect the security and integrity of the Service, including rate limiting, abuse
              prevention, and maintaining audit logs of sensitive actions.
            </li>
            <li style={{ marginBottom: "8px" }}>Comply with legal obligations.</li>
          </ul>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            4. Data Storage, Security, and PHI Prohibition
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            Your data is stored on secure servers provided by our infrastructure and database
            provider, encrypted in transit and at rest. We use row-level security and role-based
            access control so that access to data is restricted by organization and by your role.
            Passwords are managed by our authentication provider and are never stored in plain text,
            and we support multi-factor authentication. We track active sessions, rate-limit
            sensitive endpoints, and keep audit logs of role changes and schedule publishing. We do
            not sell your personal information to third parties. No method of transmission or
            storage is completely secure; if we become aware of a security incident affecting your
            personal information, we will notify affected users and authorities as required by
            applicable law.
          </p>
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              background: "var(--dg-color-warning-bg)",
              borderLeft: "4px solid var(--dg-color-warning)",
              borderRadius: "4px",
            }}
          >
            <p
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                fontWeight: 600,
                color: "var(--dg-color-warning-text)",
                marginBottom: "8px",
              }}
            >
              PROHIBITION OF PROTECTED HEALTH INFORMATION (PHI)
            </p>
            <p
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                lineHeight: 1.5,
                color: "var(--dg-color-warning-text)",
              }}
            >
              DubGrid is designed for operational staff scheduling and is <strong>not</strong> a
              HIPAA-compliant platform. The Service is not intended for the storage, transmission,
              or processing of Protected Health Information (PHI) as defined under the Health
              Insurance Portability and Accountability Act (HIPAA). Users are strictly prohibited
              from entering resident or patient names, medical records, diagnoses, or any clinical
              health data into employee records, schedules, or free-form notes fields. Notes must be
              limited to operational scheduling coordination (for example, &quot;day shift needs
              coverage in Wing A&quot;).
            </p>
          </div>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            5. Data Retention
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            We retain your account and profile data for as long as your account is active and as
            needed to provide the Service. Organization data, employee rosters, shifts, and notes
            are retained while the organization uses the Service; archived records are retained
            according to each organization&apos;s configurable retention setting (365 days by
            default) before being purged. Cookie consent records are kept as an append-only
            compliance log and are not deleted with your account. We keep routine encrypted backups
            for disaster recovery, and these may persist for a limited period after deletion.
          </p>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginTop: "12px",
            }}
          >
            You can request a copy of your personal data (data export) or its deletion at any time.
            Account deletion removes your profile, memberships, sessions, and preferences, and
            either deletes or anonymizes the personal data associated with your account, subject to
            records we must keep by law. See Your California Privacy Rights below for how to make a
            request.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            6. Your California Privacy Rights
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginBottom: "16px",
            }}
          >
            This section describes the categories of personal information we handle and the rights
            available to California residents under the California Consumer Privacy Act, as amended
            (CCPA/CPRA). We extend the core choices below to all of our users.
          </p>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginBottom: "16px",
            }}
          >
            In the past twelve months we have collected these categories of personal information,
            used for the business purposes described in this policy and disclosed only to the
            service providers listed below:
          </p>
          <ul
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              paddingLeft: "24px",
              marginBottom: "16px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              <strong>Identifiers</strong> (name, email address, phone number, account and
              organization identifiers).
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Professional or employment information</strong> (role, designation, focus
              areas, seniority, FTE weight, schedule and shift assignments).
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Internet or network activity</strong> (IP address, browser type, request
              metadata, and, with consent, analytics about how you use the Service).
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Commercial information</strong> (subscription and billing status; payment
              details are handled directly by our payment processor).
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Geographic information</strong> (only an organization address that an
              administrator chooses to enter).
            </li>
          </ul>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginBottom: "16px",
            }}
          >
            <strong>We do not sell or share your personal information</strong>, and we have not done
            so in the past twelve months. We do not use sensitive personal information for purposes
            that would require a right to limit. We do not knowingly collect personal information
            from minors.
          </p>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginBottom: "16px",
            }}
          >
            Subject to applicable law, you have the right to:
          </p>
          <ul
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              paddingLeft: "24px",
              marginBottom: "16px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              <strong>Know and access</strong> the personal information we hold about you and
              request a portable copy.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Correct</strong> inaccurate personal information.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Delete</strong> your personal information, subject to records we must retain
              by law.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Opt out</strong> of any sale or sharing of personal information (not
              applicable, as we do neither).
            </li>
          </ul>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            You can update profile details directly in the Service, and request a data export or
            account deletion from your profile settings. To make any other request, email us at{" "}
            <a
              href="mailto:support@dubgrid.com"
              style={{ color: "var(--dg-color-brand)", textDecoration: "underline" }}
            >
              support@dubgrid.com
            </a>
            . We will verify your identity using your account before acting on a request, and you
            may use an authorized agent where the law permits. We will not discriminate against you
            for exercising these rights. Because the Service is provided to organizations, some
            requests about organization or roster data may be directed to your organization&apos;s
            administrators.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            7. Third-Party Service Providers
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginBottom: "16px",
            }}
          >
            We use the following US-based service providers to operate and improve DubGrid. Each
            processes data on our behalf under data processing terms and in accordance with its own
            privacy policy:
          </p>
          <ul
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              paddingLeft: "24px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              <strong>Supabase</strong> (authentication and database hosting): account, profile,
              organization, roster, and schedule data.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Vercel</strong> (application hosting and web performance analytics, analytics
              consent required): request and performance metadata.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>PostHog</strong> (product analytics, consent required): page views and
              feature-usage events, using localStorage and cookies.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Sentry</strong> (error monitoring, always on; session replay, analytics
              consent required): stack traces and request context. No personally identifiable
              information is sent.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Stripe</strong> (payment processing): billing contact and payment metadata,
              shared only during checkout and billing.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Resend</strong> (transactional email delivery): recipient email address and
              message content for invitations, verification, password resets, and notifications.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Upstash</strong> (rate limiting): a hashed identifier and request counts, used
              to protect the Service from abuse.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Google Maps Platform</strong> (address autocomplete): address text you type
              when configuring an organization, sent to Google to return address suggestions.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Expo, Apple Push Notification service, and Firebase Cloud Messaging</strong>{" "}
              (mobile push notifications): a device push token, used to deliver notifications to the
              mobile app.
            </li>
          </ul>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginTop: "16px",
            }}
          >
            Our web fonts are self-hosted, so loading the Service does not contact a third-party
            font provider.
          </p>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginTop: "16px",
            }}
          >
            For a full list of cookies and how to manage them, see our{" "}
            <Link
              href="/cookie-policy"
              style={{ color: "var(--dg-color-brand)", textDecoration: "underline" }}
            >
              Cookie Policy
            </Link>
            .
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            8. Children&apos;s Privacy
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            DubGrid is a business tool intended for use by adult employees and administrators. The
            Service is not directed to children, and we do not knowingly collect personal
            information from anyone under 18. If you believe a minor has provided us personal
            information, contact us and we will delete it.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            9. Changes to This Policy
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            We may update this Privacy Policy from time to time. We will post the updated policy on
            this page and update the &ldquo;Last updated&rdquo; date, and we will provide notice of
            material changes by email or within the Service where appropriate. Continued use of the
            Service after changes constitutes acceptance of the revised policy.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            10. Contact Us
          </h2>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            If you have questions about this Privacy Policy or our data practices, or wish to
            exercise a privacy right, contact us at:
          </p>
          <p
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--dg-color-text-secondary)",
              marginTop: "12px",
            }}
          >
            DubGrid LLC
            <br />
            [REGISTERED ADDRESS]
            <br />
            <a
              href="mailto:support@dubgrid.com"
              style={{ color: "var(--dg-color-brand)", textDecoration: "underline" }}
            >
              support@dubgrid.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
