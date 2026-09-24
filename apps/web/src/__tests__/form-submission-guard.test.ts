import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guard = readFileSync(resolve(process.cwd(), "public/dg-form-submit-guard.js"), "utf-8");
const sharedForm = readFileSync(resolve(process.cwd(), "src/components/Form.tsx"), "utf-8");
const stepUpForm = readFileSync(
  resolve(process.cwd(), "src/components/auth/StepUpForm.tsx"),
  "utf-8",
);

describe("pre-hydration form submission guard", () => {
  it("protects every client-owned form before React can attach its handlers", () => {
    expect(guard).toContain('document.addEventListener(\n    "submit"');
    expect(guard).toContain('form.dataset.dgClientForm === "true"');
    expect(guard).toContain("event.preventDefault()");
    expect(sharedForm).toContain('data-dg-client-form="true"');
    expect(stepUpForm).toContain('data-dg-client-form="true"');
  });
});
