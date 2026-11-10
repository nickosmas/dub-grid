import { describe, expect, it } from "vitest";
import { confirmationAlertSpec } from "./confirmation-alert";

describe("confirmationAlertSpec", () => {
  it("puts cancel first and the confirm last", () => {
    expect(confirmationAlertSpec({ title: "Sign out?", confirmLabel: "Sign out" })).toEqual({
      title: "Sign out?",
      message: undefined,
      buttons: [
        { kind: "cancel", text: "Cancel", style: "cancel" },
        { kind: "confirm", text: "Sign out", style: "default" },
      ],
    });
  });

  it("marks a danger confirm destructive and keeps its own cancel wording", () => {
    const spec = confirmationAlertSpec({
      title: "Discard unsaved changes?",
      body: "Your edits won't be saved.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      confirmTone: "danger",
    });
    expect(spec.message).toBe("Your edits won't be saved.");
    expect(spec.buttons).toEqual([
      { kind: "cancel", text: "Keep editing", style: "cancel" },
      { kind: "confirm", text: "Discard", style: "destructive" },
    ]);
  });

  it("places a second action between cancel and confirm", () => {
    const spec = confirmationAlertSpec({
      title: "Lose a focus area?",
      confirmLabel: "Clear shifts",
      cancelLabel: "Close",
      secondaryAction: { label: "Keep shifts" },
    });
    expect(spec.buttons.map((button) => button.text)).toEqual([
      "Close",
      "Keep shifts",
      "Clear shifts",
    ]);
  });

  it("asks Save, Discard and Keep editing as three plain buttons, none destructive", () => {
    const spec = confirmationAlertSpec({
      title: "Save your changes?",
      body: "You haven't saved what you changed here.",
      confirmLabel: "Save",
      cancelLabel: "Keep editing",
      confirmTone: "primary",
      secondaryAction: { label: "Discard" },
    });
    expect(spec.buttons).toEqual([
      { kind: "cancel", text: "Keep editing", style: "cancel" },
      { kind: "secondary", text: "Discard", style: "default" },
      { kind: "confirm", text: "Save", style: "default" },
    ]);
  });

  it("adds a summary after the body, one point plainly and several as bullets", () => {
    expect(
      confirmationAlertSpec({
        title: "Offboard?",
        body: "They lose access.",
        confirmLabel: "Offboard",
        summary: { points: ["Their requests close."] },
      }).message,
    ).toBe("They lose access.\n\nTheir requests close.");
    expect(
      confirmationAlertSpec({
        title: "Offboard?",
        confirmLabel: "Offboard",
        summary: { title: "What happens", points: ["Requests close.", "Shifts clear."] },
      }).message,
    ).toBe("What happens\n• Requests close.\n• Shifts clear.");
  });
});
