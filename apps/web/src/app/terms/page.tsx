import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 86400; // 24 hours

export const metadata: Metadata = {
  title: "Terms of Service | DubGrid",
};

// Scope: written for the US market, governed by the laws of the State of
// Delaware. If DubGrid begins serving EU/UK users, add the corresponding
// consumer and data-protection terms.
export default function TermsOfServicePage() {
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
          Terms of Service
        </h1>
        <p style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-subtle)", marginBottom: "40px" }}>
          Last updated: May 2026
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
            1. Acceptance of Terms
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            DubGrid is operated by DubGrid LLC (&ldquo;DubGrid,&rdquo;
            &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). By
            accessing or using DubGrid (&ldquo;the Service&rdquo;), you agree to
            be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you are
            using the Service on behalf of an organization, you represent that
            you have authority to bind that organization to these Terms. If you
            do not agree to these Terms, do not use the Service.
          </p>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)", marginTop: "16px" }}>
            You must be at least 18 years old and able to form a binding
            contract to use the Service. The Service is intended for
            organizations and users located in the United States.
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
            2. Description of the Service
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            DubGrid is a multi-tenant web application for staff scheduling in
            care facilities. The Service allows organizations to manage
            employee rosters, create and edit shift schedules (including
            draft and published states), organize staff by focus areas,
            configure shifts, jobs, and absence types (for example day,
            evening, night, PTO), and view
            shift counts and printed schedules. Access to features and data
            is determined by role (e.g., platform administrator, organization
            admin, scheduler, supervisor, or staff). Each organization uses
            the Service under a unique subdomain and can only access its own
            data. The Service is provided &ldquo;as is&rdquo; and is intended
            for internal scheduling and roster management only; it does not
            include payroll, time-clock, or HR system integrations unless
            otherwise stated.
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
            3. Accounts and Access
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)", marginBottom: "16px" }}>
            You must create an account (or accept an organization invitation)
            to use the Service. You are responsible for maintaining the
            confidentiality of your login credentials and for all activity
            that occurs under your account. You must provide accurate and
            complete information when registering or when invited. Access to
            organization data is granted by your organization&apos;s
            administrators; we do not guarantee that any particular user
            will have access to any particular feature or dataset. You must
            use the correct subdomain for your organization to access your
            organization.
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
            4. Acceptable Use
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)", marginBottom: "16px" }}>
            You agree to use the Service only for lawful purposes and in
            accordance with these Terms. You must not:
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
              Use the Service in any way that violates applicable laws or
              regulations.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Attempt to gain unauthorized access to any part of the Service,
              other accounts, or other organizations&apos; data.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Use the Service to store or transmit malicious code, or to
              interfere with or disrupt the Service or its infrastructure.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Share your account credentials or allow others to use your
              account except as permitted by your organization&apos;s
              policies.
            </li>
            <li style={{ marginBottom: "8px" }}>
              Use the Service to store or process personal or sensitive data
              in a manner that violates your organization&apos;s obligations
              or applicable data protection laws.
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>HIPAA / PHI Prohibition:</strong> Store, process, or
              transmit Protected Health Information (PHI) as defined by the
              Health Insurance Portability and Accountability Act (HIPAA).
              DubGrid is an operational tool only; the user and their
              organization are solely responsible for ensuring that no HIPAA
              data, clinical records, or resident health information is
              entered into the Service.
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
            5. Roles and Responsibilities
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            Organization administrators and schedulers are responsible for
            managing their organization&apos;s roster, schedules, focus areas,
            shift types, and user invitations. Supervisors may have limited
            edit access (e.g., within their focus area or for certain note types).
            Staff users typically have read-only access to view schedules.
            You are responsible for ensuring that only authorized personnel
            receive elevated roles and that schedule and employee data are
            accurate and used appropriately. DubGrid provides the platform
            and access controls; it does not assume responsibility for
            staffing decisions, labor compliance, or how your organization
            uses the data within the Service.
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
            6. Subscriptions, Billing, and Payment
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)", marginBottom: "16px" }}>
            Paid plans are offered as a per-seat monthly subscription. New
            organizations may receive a free trial of 14 days; unless you cancel
            before the trial ends, the subscription begins and the payment
            method on file is charged. Subscriptions renew automatically each
            month until cancelled. Fees are stated exclusive of taxes, which you
            are responsible for where applicable.
          </p>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)", marginBottom: "16px" }}>
            Payments are processed by our payment processor, Stripe; we do not
            store full payment card details. You can cancel at any time from
            your billing settings, effective at the end of the current billing
            period. If you cancel mid-period, we will refund the unused portion
            of that period on a pro-rata basis. Except for that pro-rata refund
            and any refund required by law, fees are non-refundable.
          </p>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            We may change subscription prices on reasonable advance notice,
            effective at your next renewal. If your payment fails or is overdue,
            we may suspend or limit access to paid features until the balance is
            resolved.
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
            7. Customer Data and Privacy
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            As between you and us, your organization owns the roster, schedule,
            and other data it submits to the Service (&ldquo;Customer
            Data&rdquo;). You grant us a non-exclusive license to host, store,
            process, transmit, and display Customer Data solely to provide and
            improve the Service. Our handling of personal information is
            described in our{" "}
            <Link
              href="/privacy"
              style={{ color: "var(--color-brand)", textDecoration: "underline" }}
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              href="/cookie-policy"
              style={{ color: "var(--color-brand)", textDecoration: "underline" }}
            >
              Cookie Policy
            </Link>
            , which are incorporated into these Terms. If you send us feedback
            or suggestions, you grant us a perpetual, royalty-free license to use
            them without restriction.
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
            8. Intellectual Property
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            The Service, including its software, design, text, graphics, and
            layout (excluding content you or your organization submit), is
            owned by DubGrid or its licensors and is protected by
            intellectual property laws. You may not copy, modify, distribute,
            or create derivative works of the Service or reverse-engineer its
            functionality except as expressly permitted by applicable law or
            by us in writing. You retain ownership of the data you and your
            organization submit to the Service; you grant us the license
            necessary to host, store, process, and display that data to
            provide and improve the Service.
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
            9. Service Availability
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            We use commercially reasonable efforts to keep the Service
            available, but we do not guarantee any particular level of uptime
            and the Service may be unavailable from time to time for
            maintenance, updates, or reasons outside our control. We may modify,
            suspend, or discontinue features of the Service at any time.
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
            10. Disclaimer of Warranties
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
            AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
            IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
            UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS. YOU USE
            THE SERVICE AT YOUR OWN RISK. THE SERVICE IS A SCHEDULING AND
            ROSTER TOOL; IT IS NOT A SUBSTITUTE FOR PROFESSIONAL ADVICE
            REGARDING STAFFING, LABOR LAW, OR COMPLIANCE.
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
            11. Limitation of Liability
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, DUBGRID AND ITS
            AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE
            FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
            DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING
            OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, WHETHER
            IN CONTRACT, TORT, STRICT LIABILITY, OR OTHERWISE. IN NO EVENT
            SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID US (IF ANY)
            IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. SOME
            JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF
            CERTAIN DAMAGES; IN SUCH JURISDICTIONS, OUR LIABILITY WILL BE
            LIMITED TO THE GREATEST EXTENT PERMITTED BY LAW.
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
            12. Indemnification
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            You agree to indemnify and hold harmless DubGrid and its affiliates,
            officers, employees, and agents from any claims, damages, losses, or
            expenses (including reasonable legal fees) arising out of your
            Customer Data, your use of the Service, or your violation of these
            Terms or applicable law, including any entry of prohibited health
            information into the Service.
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
            13. Termination
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            We may suspend or terminate your access to the Service, or your
            organization&apos;s access, for violation of these Terms, for
            non-payment (if applicable), or for any other reason we deem
            necessary. Your organization&apos;s administrators may revoke
            your access or change your role at any time. Upon termination,
            your right to use the Service ceases. Provisions that by their
            nature should survive (including intellectual property,
            disclaimers, limitation of liability, and governing law) will
            survive termination.
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
            14. Changes to the Service and Terms
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            We may modify the Service or these Terms from time to time. We
            will post updated Terms on this page and update the &ldquo;Last
            updated&rdquo; date. Material changes may be communicated via the
            Service or by email where appropriate. Continued use of the
            Service after such changes constitutes acceptance of the revised
            Terms. If you do not agree to the new Terms, you must stop using
            the Service.
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
            15. Governing Law and Disputes
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            These Terms are governed by the laws of the State of Delaware, USA,
            without regard to its conflict of law principles. Any dispute
            arising out of or relating to these Terms or the Service shall be
            resolved exclusively in the state or federal courts located in
            Delaware, and you consent to their jurisdiction, except where
            prohibited. You may also have consumer or statutory rights that
            cannot be waived by contract.
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
            16. General
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            These Terms, together with the Privacy Policy and Cookie Policy, are
            the entire agreement between you and DubGrid regarding the Service
            and supersede any prior agreements. If any provision is found
            unenforceable, the remaining provisions stay in effect. You may not
            assign these Terms without our consent; we may assign them in
            connection with a merger, acquisition, or sale of assets. Our
            failure to enforce a provision is not a waiver of it. We are not
            liable for delays or failures caused by events beyond our reasonable
            control. We may provide notices to you by email or within the
            Service.
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
            17. Contact
          </h2>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            For questions about these Terms of Service, contact us at:
          </p>
          <p style={{ fontSize: "var(--dg-fs-body)", lineHeight: 1.7, color: "var(--color-text-secondary)", marginTop: "12px" }}>
            DubGrid LLC<br />
            [REGISTERED ADDRESS]<br />
            <a
              href="mailto:support@dubgrid.com"
              style={{ color: "var(--color-brand)", textDecoration: "underline" }}
            >
              support@dubgrid.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
