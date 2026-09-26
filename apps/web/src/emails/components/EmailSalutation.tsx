import * as React from "react";
import { Text } from "@react-email/components";
import { emailTheme, styles } from "./theme";

/** No name: the address may not be the reader's, so the greeting assumes nothing. */
export function EmailGreeting() {
  return <Text style={styles.paragraph}>Hi there,</Text>;
}

export function EmailSignOff() {
  return (
    <Text style={styles.paragraph}>
      Thanks,
      <br />
      <strong style={{ color: emailTheme.textPrimary }}>The DubGrid team</strong>
    </Text>
  );
}
