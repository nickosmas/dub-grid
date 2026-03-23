import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | DubGrid",
};

export default function PrivacyPolicyPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-surface)",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "var(--color-text-primary)",
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: "32px",
            color: "var(--color-text-subtle)",
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
        <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-subtle)", marginBottom: "40px" }}>
          Last updated: March 2026
        </p>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            1. Introduction
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            DubGrid (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;)
            operates a multi-tenant staff scheduling platform for care
            facilities. This Privacy Policy explains how we collect, use,
            store, and protect information when you use our web application
            and related services (the &ldquo;Service&rdquo;). By using
            DubGrid, you agree to the practices described in this policy.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            2. Information We Collect
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)", marginBottom: "16px" }}>
            We collect information necessary to provide the Service and to
            manage your organization&apos;s schedules and staff.
          </p>
          <ul
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
              paddingLeft: "24px",
              marginBottom: "16px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              <strong>Account and authentication.</strong> When you sign up
              or sign in, we collect your email address and password (stored
              in encrypted form). We may also store your first and last name
              when you provide it or when it is derived from your account
              profile.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Profile and role data.</strong> We store your
              association with an organization, your role (e.g., admin,
              scheduler, supervisor, or staff), and platform-level role if
              applicable. This allows us to enforce access control and show
              you the appropriate features and data.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Organization data.</strong> For each organization
              (tenant), we store the organization name, subdomain identifier,
              and optional contact information such as address and phone
              number that administrators may configure.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Employee roster data.</strong> Organizations use
              DubGrid to manage staff rosters. This may include employee
              names, designations, roles, focus area assignments,
              seniority, FTE weight, and optional contact information (phone,
              email, contact notes) that your organization chooses to store
              in the system.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Schedule and shift data.</strong> We store shift
              assignments (which employee is assigned which shift code on which
              date), draft and published schedule states, and any schedule or
              shift notes (e.g., readings, shower notes) that authorized users
              add.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Invitation data.</strong> When an administrator invites
              a user to join an organization, we store the invitee&apos;s
              email address, the role to be assigned, and the invitation
              status and expiry.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Technical and usage data.</strong> Our infrastructure
              (including authentication and database hosting) may log
              technical data such as IP address, browser type, and request
              metadata to operate and secure the Service. DubGrid does not
              use third-party analytics or advertising trackers on the
              application.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            3. How We Use Your Information
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)", marginBottom: "16px" }}>
            We use the information we collect to:
          </p>
          <ul
            style={{
              fontSize: "var(--dg-fs-body)",
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
              paddingLeft: "24px",
            }}
          >
            <li style={{ marginBottom: "8px" }}>
              Provide, maintain, and improve the scheduling and roster
              features of the Service.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Authenticate you and enforce role-based access so that users
              only see and edit data they are permitted to access.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Isolate each organization&apos;s data (multi-tenant isolation)
              so that one organization cannot access another&apos;s data.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Send invitation emails and support account onboarding when you
              are invited to an organization.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Comply with legal obligations and protect the security and
              integrity of the Service.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            4. Data Storage, Security, and PHI Prohibition
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            Your data is stored on secure servers provided by our
            infrastructure and database provider. We use row-level security
            and role-based access control so that access to data is restricted
            by organization and by your role. Passwords are not stored in
            plain text. We do not sell your personal information to third
            parties.
          </p>
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              background: "var(--color-warning-bg)",
              borderLeft: "4px solid var(--color-warning)",
              borderRadius: "4px",
            }}
          >
            <p
              style={{
                fontSize: "var(--dg-fs-body-sm)",
                fontWeight: 600,
                color: "var(--color-warning-text)",
                marginBottom: "8px",
              }}
            >
              PROHIBITION OF PROTECTED HEALTH INFORMATION (PHI)
            </p>
            <p style={{ fontSize: "var(--dg-fs-body-sm)", lineHeight: 1.5, color: "var(--color-warning-text)" }}>
              DubGrid is designed for operational staff scheduling and is
              <strong>not</strong> a HIPAA-compliant platform. The Service is not
              intended for the storage, transmission, or processing of Protected
              Health Information (PHI) as defined under the Health Insurance
              Portability and Accountability Act (HIPAA). Users are strictly
              prohibited from entering resident names, medical records, or
              clinical health data into any free-form notes fields. Any shift or
              reading notes must be limited to operational coordination (e.g.,
              "John assigned to Reading A").
            </p>
          </div>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            5. Data Retention
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            We retain your account and profile data for as long as your
            account is active and as needed to provide the Service. Organization
            data, employee rosters, shifts, and notes are retained for as long
            as the organization uses the Service. If you delete your account
            or an organization is removed, we may retain certain data as
            required by law or for legitimate operational purposes (e.g.,
            backup or audit). You may contact us to request deletion of your
            personal data subject to applicable law.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            6. Your Rights and Choices
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            Depending on your jurisdiction, you may have the right to access,
            correct, or delete your personal information, or to restrict or
            object to certain processing. You can update your profile
            information (such as your name) within the Service where that
            functionality is available. For other requests or questions
            about your data, please contact us using the details below.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            7. Changes to This Policy
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            We may update this Privacy Policy from time to time. We will
            post the updated policy on this page and update the &ldquo;Last
            updated&rdquo; date. Continued use of the Service after changes
            constitutes acceptance of the revised policy.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "var(--dg-fs-heading)",
              fontWeight: 600,
              marginBottom: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            8. Contact Us
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            If you have questions about this Privacy Policy or our data
            practices, please contact us at the email or address provided on
            the DubGrid website or in your organization&apos;s account
            materials.
          </p>
        </section>
      </div>
    </div>
  );
}
