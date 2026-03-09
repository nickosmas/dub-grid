"use client";

import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        color: "#111827",
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginBottom: "32px",
            color: "#6B7280",
            fontSize: "14px",
            textDecoration: "none",
          }}
        >
          ← Back to DubGrid
        </Link>

        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            marginBottom: "8px",
          }}
        >
          Terms of Service
        </h1>
        <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "40px" }}>
          Last updated: March 2025
        </p>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            1. Acceptance of Terms
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
            By accessing or using DubGrid (&ldquo;the Service&rdquo;), you
            agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;).
            If you are using the Service on behalf of an organization, you
            represent that you have authority to bind that organization to
            these Terms. If you do not agree to these Terms, do not use the
            Service.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            2. Description of the Service
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
            DubGrid is a multi-tenant web application for staff scheduling in
            care facilities. The Service allows organizations to manage
            employee rosters, create and edit shift schedules (including
            draft and published states), organize staff by wings or sections,
            assign shift codes (e.g., day, evening, night, PTO), and view
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
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            3. Accounts and Access
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151", marginBottom: "16px" }}>
            You must create an account (or accept an organization invitation)
            to use the Service. You are responsible for maintaining the
            confidentiality of your login credentials and for all activity
            that occurs under your account. You must provide accurate and
            complete information when registering or when invited. Access to
            organization data is granted by your organization&apos;s
            administrators; we do not guarantee that any particular user
            will have access to any particular feature or dataset. You must
            use the correct subdomain for your organization to access your
            workspace.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            4. Acceptable Use
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151", marginBottom: "16px" }}>
            You agree to use the Service only for lawful purposes and in
            accordance with these Terms. You must not:
          </p>
          <ul
            style={{
              fontSize: "15px",
              lineHeight: 1.7,
              color: "#374151",
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
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            5. Roles and Responsibilities
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
            Organization administrators and schedulers are responsible for
            managing their organization&apos;s roster, schedules, wings,
            shift types, and user invitations. Supervisors may have limited
            edit access (e.g., within their wing or for certain note types).
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
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            6. Intellectual Property
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
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
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            7. Disclaimer of Warranties
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
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
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            8. Limitation of Liability
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
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
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            9. Termination
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
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
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            10. Changes to the Service and Terms
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
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
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            11. Governing Law and Disputes
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
            These Terms are governed by the laws of the jurisdiction in which
            DubGrid operates, without regard to conflict of law principles.
            Any dispute arising out of or relating to these Terms or the
            Service shall be resolved in the courts of that jurisdiction,
            except where prohibited. You may also have consumer or statutory
            rights that cannot be waived by contract.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px",
              color: "#1F2937",
            }}
          >
            12. Contact
          </h2>
          <p style={{ fontSize: "15px", lineHeight: 1.7, color: "#374151" }}>
            For questions about these Terms of Service, please contact us at
            the email or address provided on the DubGrid website or in your
            organization&apos;s account materials.
          </p>
        </section>
      </div>
    </div>
  );
}
