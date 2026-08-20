/**
 * The landing toggle used to be binary (light ↔ dark), which meant a visitor
 * who touched it could never get back to "System" from this page. Combined
 * with the apex and org subdomain being separate origins, that stranded
 * preference is what made the theme appear to flip on sign-in.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

const setTheme = vi.fn();
let theme: string | undefined;

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme, setTheme }),
}));

import ThemeToggleButton from "@/components/landing/ThemeToggleButton";

describe("ThemeToggleButton", () => {
  beforeEach(() => {
    setTheme.mockReset();
    theme = "light";
  });

  it("cycles light → dark → system → light", () => {
    const cases: [string, string][] = [
      ["light", "dark"],
      ["dark", "system"],
      ["system", "light"],
    ];

    for (const [current, expected] of cases) {
      theme = current;
      const { unmount } = render(<ThemeToggleButton />);
      fireEvent.click(screen.getByRole("button"));
      expect(setTheme).toHaveBeenCalledWith(expected);
      setTheme.mockReset();
      unmount();
    }
  });

  it("exposes the current theme and the next step in its label", () => {
    theme = "system";
    render(<ThemeToggleButton />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Theme: system. Switch to light mode.",
    );
  });

  // next-themes reports `undefined` before it mounts; the button still has to
  // render and still has to have a sensible next step.
  it("falls back to the first step when the theme is unresolved", () => {
    theme = undefined;
    render(<ThemeToggleButton />);
    fireEvent.click(screen.getByRole("button"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
