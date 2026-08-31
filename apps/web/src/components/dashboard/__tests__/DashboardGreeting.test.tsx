import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardGreeting, {
  __resetDashboardGreetingMountCacheForTests,
} from "@/components/dashboard/DashboardGreeting";

const NOW = new Date("2026-06-01T10:00:00Z");

describe("DashboardGreeting", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    __resetDashboardGreetingMountCacheForTests();
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

    // Different identity (e.g. impersonation switch, or a different seeded
    // account signing in within the same tab) must not reuse Alice's headline.
    render(<DashboardGreeting name="Bob" now={NOW} userId="user-bob" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Welcome, Bob!");
    expect(screen.getByRole("heading")).not.toHaveTextContent("Alice");
  });

  it("dedupes a synchronous remount (React StrictMode double-mount)", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(<DashboardGreeting name="Alice" now={NOW} userId="user-alice" />);
    const first = screen.getByRole("heading").textContent;

    cleanup();

    // Same tick — no real time has passed, so this must not reshuffle.
    render(<DashboardGreeting name="Alice" now={NOW} userId="user-alice" />);
    expect(screen.getByRole("heading")).toHaveTextContent(first ?? "");
    nowSpy.mockRestore();
  });

  it("picks a fresh greeting after a real navigation away and back", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(<DashboardGreeting name="Alice" now={NOW} userId="user-alice" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Welcome, Alice!");

    cleanup();

    // Well past the dev-remount dedupe window, and the welcome flag is now
    // consumed (localStorage marked Alice as seen), so this should land on
    // the time-of-day pool instead of repeating the welcome.
    nowSpy.mockReturnValue(10_000);
    render(<DashboardGreeting name="Alice" now={NOW} userId="user-alice" />);
    expect(screen.getByRole("heading")).not.toHaveTextContent("Welcome, Alice!");
    nowSpy.mockRestore();
  });

  it("only mentions setup when needsSetup is true", () => {
    render(<DashboardGreeting name="Alice" now={NOW} userId="user-alice" needsSetup={false} />);
    expect(screen.getByRole("heading").textContent).not.toMatch(/set up/i);

    cleanup();
    __resetDashboardGreetingMountCacheForTests();
    window.localStorage.clear();

    render(<DashboardGreeting name="Bob" now={NOW} userId="user-bob" needsSetup />);
    expect(screen.getByRole("heading").textContent).toMatch(/set up/i);
  });
});
