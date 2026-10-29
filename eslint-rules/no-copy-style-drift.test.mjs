import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import { noCopyStyleDrift } from "./no-copy-style-drift.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const drift = { messageId: "drift" };

tester.run("no-copy-style-drift", noCopyStyleDrift, {
  valid: [
    'toast.error("We couldn\'t save that. Try again.");',
    'const a = <Button label="Search staff" />;',
    "const a = <p>7:00 AM - 3:00 PM</p>;",
    // A fallback beside the org's label is not shown as written.
    'const a = <Select label={org.focusAreaLabel || "Focus Areas"} />;',
    'const label = org.focusAreaLabel ?? "Focus Areas";',
    // Not a visible key.
    'const keys = { focusAreas: "focus_areas" };',
    'logger.error("CRON_SECRET not configured — refusing to run");',
    // Settings > Labels names the default it renames.
    "const item = { description: \"For example, rename 'Focus Areas' to 'Wings'.\" };",
    // Settings > Labels names the label it edits.
    { code: 'const a = <Field label="Focus area label" />;', options: [{ allowFocusArea: true }] },
  ],
  invalid: [
    { code: "const a = <p>Loading…</p>;", errors: [drift] },
    { code: 'const a = <Input placeholder="Search staff…" />;', errors: [drift] },
    { code: 'toast.error("Saved — mostly");', errors: [drift] },
    { code: "const a = <span>{start}–{end}</span>;", errors: [drift] },
    { code: 'toast.info("Please wait.");', errors: [drift] },
    { code: 'const r = { error: "Please sign in again." };', errors: [drift] },
    { code: 'const r = { error: "Export failed. Failed to write file." };', errors: [drift] },
    { code: 'toast.error("Failed to save shift");', errors: [drift] },
    { code: 'const a = <EmptyState title="No focus areas yet" />;', errors: [drift] },
    { code: "const o = { label: `All ${n} focus areas` };", errors: [drift] },
    { code: "const a = <p>Choose a focus area first.</p>;", errors: [drift] },
    { code: 'const a = <View accessibilityLabel="Focus areas" />;', errors: [drift] },
    // The option allows only the term, never the characters.
    {
      code: 'const a = <Field label="Focus area label\u2026" />;',
      options: [{ allowFocusArea: true }],
      errors: [drift],
    },
  ],
});
