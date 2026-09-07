import * as React from "react";
import { Button, Section } from "@react-email/components";
import { emailTheme, fontStack } from "./theme";

export type EmailButtonProps = {
  href: string;
  children: React.ReactNode;
};

/** Brand-blue primary CTA, centered, matching the app's button styling. */
export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <Section style={{ textAlign: "center", margin: "0 0 32px" }}>
      <Button
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: emailTheme.brand,
          color: emailTheme.textInverse,
          fontFamily: fontStack,
          fontSize: "16px",
          fontWeight: 700,
          textDecoration: "none",
          padding: "14px 40px",
          borderRadius: "8px",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}
