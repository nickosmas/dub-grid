import * as React from "react";
import { Section, Text } from "@react-email/components";
import { emailClass, emailTheme, fontStack, styles, text } from "./theme";

// A card holds facts or a code, never a sentence, and an email has one at most.

export type EmailDetail = { label: string; value: React.ReactNode };

/** Facts worth finding at a glance, one under another, each with a label. */
export function EmailDetails({ details }: { details: EmailDetail[] }) {
  return (
    <Section className={emailClass.card} style={{ ...styles.card, padding: "2px 16px" }}>
      {details.map(({ label, value }, index) => (
        <Section
          key={label}
          className={emailClass.rule}
          style={{
            padding: "12px 0",
            borderTop: index === 0 ? "0" : `1px solid ${emailTheme.border}`,
          }}
        >
          <Text className={emailClass.muted} style={{ ...styles.fine, fontWeight: 500 }}>
            {label}
          </Text>
          <Text
            className={emailClass.ink}
            style={{
              margin: "2px 0 0",
              fontSize: "15px",
              lineHeight: "22px",
              color: emailTheme.textPrimary,
              wordBreak: "break-word",
            }}
          >
            {value}
          </Text>
        </Section>
      ))}
    </Section>
  );
}

/** A one-time code. */
export function EmailCode({ label, code }: { label: string; code: string }) {
  return (
    <Section className={emailClass.card} style={{ ...styles.card, padding: "14px 16px" }}>
      <Text {...text.fine}>{label}</Text>
      <Text
        className={emailClass.ink}
        style={{
          margin: "4px 0 0",
          fontFamily: fontStack,
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: 700,
          letterSpacing: "0.16em",
          color: emailTheme.textPrimary,
        }}
      >
        {code}
      </Text>
    </Section>
  );
}
