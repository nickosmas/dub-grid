import * as React from "react";
import { Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";
import { EmailDetails } from "./components/EmailCard";
import { text, PREVIEW_LOGO_URL } from "./components/theme";

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
    <EmailLayout
      logoUrl={logoUrl}
      preview={`New demo request: ${orgName}`}
      fine={`Reply directly to this email to respond to ${contactName}.`}
    >
      <Text {...text.heading}>New demo request</Text>
      <Text {...text.paragraph}>
        <strong>{contactName}</strong> from <strong>{orgName}</strong> has requested a demo.
      </Text>
      <EmailDetails
        details={[
          { label: "Name", value: contactName },
          { label: "Email", value: email },
          ...(phone ? [{ label: "Phone", value: phone }] : []),
          { label: "Organization", value: orgName },
          { label: "Employees", value: orgSize },
          ...(industry ? [{ label: "Industry", value: industry }] : []),
        ]}
      />
      {notes ? (
        <Text {...text.paragraph}>
          <strong>Additional notes</strong>
          <br />
          <span style={{ whiteSpace: "pre-wrap" }}>{notes}</span>
        </Text>
      ) : null}
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
