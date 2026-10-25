import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AbsenceDayBar } from "./AbsenceDayBar";

const colors = { background: "#fee2e2", border: "#fca5a5", text: "#991b1b" };

function labels() {
  return [...document.querySelectorAll("[data-absence-day-bar] > div:first-child span")].map(
    (span) => span.textContent,
  );
}

describe("AbsenceDayBar", () => {
  it("reads a left-early day as the work, then the absence", () => {
    render(
      <AbsenceDayBar
        absenceName="Sick"
        absenceColors={colors}
        parts={[
          { kind: "work", start: "07:00", end: "11:00" },
          { kind: "absence", start: "11:00", end: "15:00" },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Worked 7:00 AM to 11:00 AM, Sick 11:00 AM to 3:00 PM" }),
    ).toBeInTheDocument();
    expect(labels()).toEqual(["4 hrs worked", "Sick"]);
    expect(screen.getByText("7:00 AM")).toBeInTheDocument();
    expect(screen.getByText("11:00 AM")).toBeInTheDocument();
    expect(screen.getByText("3:00 PM")).toBeInTheDocument();
  });

  it("puts the absence first for arrived late", () => {
    render(
      <AbsenceDayBar
        absenceName="PTO"
        absenceColors={colors}
        parts={[
          { kind: "absence", start: "07:00", end: "11:00" },
          { kind: "work", start: "11:00", end: "15:00" },
        ]}
      />,
    );

    expect(labels()).toEqual(["PTO", "4 hrs worked"]);
  });

  it("counts two worked shifts as one label and crosses midnight", () => {
    render(
      <AbsenceDayBar
        absenceName="Sick"
        absenceColors={colors}
        parts={[
          { kind: "work", start: "15:00", end: "23:00" },
          { kind: "work", start: "23:00", end: "01:00" },
          { kind: "absence", start: "01:00", end: "07:00" },
        ]}
      />,
    );

    expect(labels()).toEqual(["10 hrs worked", "Sick"]);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Worked 3:00 PM to 11:00 PM, Worked 11:00 PM to 1:00 AM, Sick 1:00 AM to 7:00 AM",
    );
  });
});
