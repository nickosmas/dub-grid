import * as React from "react";
import { Text } from "@react-email/components";
import { emailClass, emailTheme, text } from "./theme";

/**
 * Pass `firstName` only to mail bound for a member's own verified address. An
 * invitation or a confirmation may reach a stranger, so those assume nothing.
 */
export function EmailGreeting({ firstName }: { firstName?: string | null }) {
  const name = firstName?.trim();
  return <Text {...text.paragraph}>Hi {name || "there"},</Text>;
}

export function EmailSignOff() {
  return (
    <Text {...text.paragraph}>
      Thanks,
      <br />
      <strong className={emailClass.ink} style={{ color: emailTheme.textPrimary, fontWeight: 600 }}>
        The DubGrid team
      </strong>
    </Text>
  );
}
