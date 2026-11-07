import * as React from "react";
import { Button, Section } from "@react-email/components";
import { emailTheme, fontStack } from "./theme";

export type EmailButtonProps = {
  href: string;
  children: React.ReactNode;
};

/** Brand-blue primary CTA, which stays blue in dark mode too. */
export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <Section style={{ margin: "4px 0 28px" }}>
      <Button
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: emailTheme.brand,
          color: emailTheme.textInverse,
          fontFamily: fontStack,
          fontSize: "15px",
          lineHeight: "20px",
          fontWeight: 600,
          textDecoration: "none",
          padding: "13px 22px",
          borderRadius: "8px",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}
