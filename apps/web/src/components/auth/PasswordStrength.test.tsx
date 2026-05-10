import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  getPasswordStrengthHints,
  PasswordStrength,
} from "./PasswordStrength";

describe("PasswordStrength", () => {
  it("shows concrete password strength hints", () => {
    render(<PasswordStrength password="" />);

    expect(screen.getByText("Password requirements")).toBeInTheDocument();
    expect(screen.queryByText("Too short")).not.toBeInTheDocument();
    expect(screen.getByText("At least 10 characters")).toBeInTheDocument();
    expect(screen.getByText("Uppercase letter")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
    expect(screen.getByText("Symbol")).toBeInTheDocument();
  });

  it("marks each hint from the current password", () => {
    expect(getPasswordStrengthHints("Password-123")).toEqual([
      { id: "length", label: "At least 10 characters", met: true },
      { id: "uppercase", label: "Uppercase letter", met: true },
      { id: "number", label: "Number", met: true },
      { id: "symbol", label: "Symbol", met: true },
    ]);
  });

  it("labels a password with all hints met as strong", () => {
    render(<PasswordStrength password="Password-123" />);

    expect(screen.getByText("Strong")).toBeInTheDocument();
  });
});
