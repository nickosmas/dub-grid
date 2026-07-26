import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardGreeting from "@/components/dashboard/DashboardGreeting";

const NOW = new Date("2026-06-01T10:00:00Z");

describe("DashboardGreeting", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not reuse a previous user's cached greeting in the same tab session", () => {
    render(<DashboardGreeting name="Alice" now={NOW} userId="user-alice" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Welcome, Alice!");

    cleanup();

    // Same bucket/date, different identity (e.g. impersonation switch, or a
    // different seeded account signing in within the same tab) must not
    // reuse Alice's cached headline.
    render(<DashboardGreeting name="Bob" now={NOW} userId="user-bob" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Welcome, Bob!");
    expect(screen.getByRole("heading")).not.toHaveTextContent("Alice");
  });

  it("reuses the cached greeting for the same user within the same tab session", () => {
    render(<DashboardGreeting name="Alice" now={NOW} userId="user-alice" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Welcome, Alice!");

    cleanup();

    render(<DashboardGreeting name="Alice" now={NOW} userId="user-alice" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Welcome, Alice!");
  });
});
