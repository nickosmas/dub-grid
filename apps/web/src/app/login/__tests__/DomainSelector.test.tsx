/**
 * DomainSelector validates the subdomain (reserved words client-side,
 * existence server-side via /api/validate-domain) BEFORE redirecting —
 * landing on a broken "organization not found" page after a full page
 * reload is worse than a one-tick delay here up front.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import DomainSelector from "@/app/login/DomainSelector";

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

function submitSlug(slug: string) {
  const input = screen.getByLabelText("Organization subdomain");
  fireEvent.change(input, { target: { value: slug } });
  fireEvent.submit(input.closest("form")!);
}

describe("DomainSelector", () => {
  let hrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    hrefSetter = vi.fn();
    mockToastError.mockReset();
    Object.defineProperty(window, "location", {
      value: {
        host: "localhost",
        hostname: "localhost",
        protocol: "https:",
        port: "",
        get href() { return ""; },
        set href(v: string) { hrefSetter(v); },
      },
      writable: true,
      configurable: true,
    });
  });

  it("blocks a reserved word (gridmaster) without calling validate-domain or redirecting", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<DomainSelector />);
    submitSlug("gridmaster");

    expect(screen.getByText("That subdomain isn't available. Check your organization's URL.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(hrefSetter).not.toHaveBeenCalled();
  });

  it("blocks other reserved words (www, api, admin, login, status, app)", () => {
    render(<DomainSelector />);
    for (const word of ["www", "api", "admin", "login", "status", "app"]) {
      submitSlug(word);
      expect(hrefSetter).not.toHaveBeenCalled();
    }
  });

  it("validates existence before redirecting, and forwards the resolved name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ valid: true, name: "Acme Co" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<DomainSelector />);
    submitSlug("acme");

    await waitFor(() => {
      expect(hrefSetter).toHaveBeenCalledWith(
        "https://acme.localhost/login?verified=1&name=Acme%20Co",
      );
    });
  });

  it("shows a toast and does not redirect when the subdomain doesn't exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ valid: false, name: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<DomainSelector />);
    submitSlug("nonexistent");

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "No organization found for that subdomain. Please check and try again.",
        { id: "login-error" },
      );
    });
    expect(hrefSetter).not.toHaveBeenCalled();
  });
});
