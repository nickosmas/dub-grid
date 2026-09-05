import * as React from "react";
import { Column, Hr, Row, Section, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { emailTheme, styles, PREVIEW_LOGO_URL } from "./components/theme";

export type DemoRequestEmailProps = {
  contactName: string;
  email: string;
  phone?: string;
  orgName: string;
  orgSize: string;
  industry?: string;
  notes?: string;
  logoUrl: string;
};

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <Row>
      <Column
        style={{
          padding: "8px 12px",
          fontSize: "14px",
          color: emailTheme.textMuted,
          whiteSpace: "nowrap",
          verticalAlign: "top",
          width: "120px",
        }}
      >
        {label}
      </Column>
      <Column style={{ padding: "8px 12px", fontSize: "15px", color: emailTheme.textBody }}>
        {value}
      </Column>
    </Row>
  );
}

/** Internal-facing notice that a prospect requested a demo. */
export function DemoRequestEmail({
  contactName,
  email,
  phone,
  orgName,
  orgSize,
  industry,
  notes,
  logoUrl,
}: DemoRequestEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={`New demo request: ${orgName}`}>
      <Text style={styles.heading}>New demo request</Text>
      <Text style={styles.paragraph}>
        <strong>{contactName}</strong> from <strong>{orgName}</strong> has requested a demo.
      </Text>
      <Section
        style={{
          border: `1px solid ${emailTheme.border}`,
          borderRadius: "var(--dg-radius-md)",
          overflow: "hidden",
        }}
      >
        <Field label="Name" value={contactName} />
        <Field label="Email" value={email} />
        <Field label="Phone" value={phone} />
        <Field label="Organization" value={orgName} />
        <Field label="Employees" value={orgSize} />
        <Field label="Industry" value={industry} />
      </Section>
      {notes ? (
        <Section style={{ marginTop: "24px" }}>
          <Text style={{ ...styles.fine, margin: "0 0 8px", fontWeight: 600 }}>
            Additional notes
          </Text>
          <Text
            style={{
              ...styles.paragraph,
              fontSize: "15px",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {notes}
          </Text>
        </Section>
      ) : null}
      <Hr style={styles.divider} />
      <Text style={styles.fine}>Reply directly to this email to respond to {contactName}.</Text>
    </EmailLayout>
  );
}

DemoRequestEmail.PreviewProps = {
  contactName: "Jane Doe",
  email: "jane@acmehealth.com",
  phone: "(555) 123-4567",
  orgName: "Acme Health",
  orgSize: "50-100",
  industry: "Healthcare",
  notes: "We run three shifts across two facilities and need help coordinating coverage.",
  logoUrl: PREVIEW_LOGO_URL,
} satisfies DemoRequestEmailProps;

export default DemoRequestEmail;
