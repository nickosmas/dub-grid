import { describe, expect, it } from "vitest";
import { darkColorTokens, lightColorTokens } from "./index";
import { resolveJobChipTone, type JobChipToneContext } from "./job-chip-tone";

const light: JobChipToneContext = lightColorTokens;
const dark: JobChipToneContext = darkColorTokens;

describe("resolveJobChipTone", () => {
  it("matches supervisor-family labels case- and whitespace-insensitively", () => {
    const expected = resolveJobChipTone("supervisor", false, light);

    expect(resolveJobChipTone("  Shift Supervisor  ", false, light)).toEqual(expected);
    expect(resolveJobChipTone("TEAM LEAD", false, light)).toEqual(expected);
    expect(resolveJobChipTone("Manager", false, light)).toEqual(expected);
  });

  it("gives nurse labels a distinct tone from supervisor labels", () => {
    expect(resolveJobChipTone("RN", false, light)).not.toEqual(
      resolveJobChipTone("Supervisor", false, light),
    );
  });

  it("falls back to the neutral surface tone for an unrecognized label", () => {
    expect(resolveJobChipTone("Phlebotomist", false, light)).toEqual({
      backgroundColor: light.surfaceSecondary,
      borderColor: light.border,
      textColor: light.textMuted,
    });
  });

  // Regression guard: the schedule and requests screens had diverged here, and
  // mentor was the branch that differed. Theme tokens are already dark-correct,
  // so this branch must pass them straight through rather than re-darkening.
  it("uses the theme warning ramp verbatim for mentor labels in both themes", () => {
    expect(resolveJobChipTone("Mentor", false, light)).toEqual({
      backgroundColor: light.warningSoft,
      borderColor: light.warningBorder,
      textColor: light.warningText,
    });

    expect(resolveJobChipTone("Trainer", true, dark)).toEqual({
      backgroundColor: dark.warningSoft,
      borderColor: dark.warningBorder,
      textColor: dark.warningText,
    });
  });

  it("remaps the fixed light-tuned hues for dark mode", () => {
    const lightTone = resolveJobChipTone("Supervisor", false, light);
    const darkTone = resolveJobChipTone("Supervisor", true, dark);

    expect(darkTone).not.toEqual(lightTone);
    expect(darkTone.backgroundColor).not.toBe(lightTone.backgroundColor);
  });
});
