import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import AcceptInvitePage from "./page";

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  fetchInvitationLookup: vi.fn(),
  recordCurrentTermsAcceptance: vi.fn(),
  registerInvitedUser: vi.fn(),
  signInBrowserWithPassword: vi.fn(),
  signOutFromBrowser: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/Form", () => ({
  Form: ({
    children,
    onSubmit,
  }: {
    children: React.ReactNode;
    onSubmit: React.FormEventHandler;
  }) => <form onSubmit={onSubmit}>{children}</form>,
}));
vi.mock("@/components/auth/AuthCard", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/auth/AuthStateCard", () => ({
  AuthStateCard: ({
    heading,
    message,
    primaryCta,
  }: {
    heading: string;
    message: React.ReactNode;
    primaryCta?: { label: string; onClick?: () => void };
  }) => (
    <section>
      <h1>{heading}</h1>
      <p>{message}</p>
      {primaryCta && <button onClick={primaryCta.onClick}>{primaryCta.label}</button>}
    </section>
  ),
}));
vi.mock("@/components/Logo", () => ({
  DubGridLogo: () => <span>DubGrid logo</span>,
  DubGridWordmark: () => <span>DubGrid</span>,
}));
vi.mock("@/components/auth/ApexLandingLink", () => ({
  ApexLandingLink: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ButtonSpinner", () => ({
  ButtonLoading: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/auth/PasswordInput", () => ({
  PasswordInput: ({
    id,
    value,
    onChange,
    showPassword: _showPassword,
    onToggle: _onToggle,
    ariaDescribedBy,
    ...props
  }: any) => (
    <input
      id={id}
      type="password"
      value={value}
      aria-describedby={ariaDescribedBy}
      onChange={(event) => onChange(event.target.value)}
      {...props}
    />
  ),
}));
vi.mock("@/components/auth/PasswordStrength", () => ({ PasswordStrength: () => null }));
vi.mock("@dubgrid/domain", () => ({
  getPasswordMismatchError: (password: string, confirmation: string) =>
    confirmation && password !== confirmation ? "Passwords do not match." : null,
  isPasswordAcceptable: (password: string) => password.length >= 10,
}));
vi.mock("@/lib/sentry", () => ({ captureException: mocks.captureException }));
vi.mock("@/features/account/client", () => ({
  fetchInvitationLookup: mocks.fetchInvitationLookup,
  recordCurrentTermsAcceptance: mocks.recordCurrentTermsAcceptance,
  registerInvitedUser: mocks.registerInvitedUser,
  signInBrowserWithPassword: mocks.signInBrowserWithPassword,
  signOutFromBrowser: mocks.signOutFromBrowser,
}));
vi.mock("@/features/organization/client", () => ({ acceptInvitation: mocks.acceptInvitation }));

function setLocation(search: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      host: "localhost:3000",
      hostname: "localhost",
      protocol: "http:",
      search,
      href: `http://localhost:3000/accept-invite${search}`,
    },
  });
}

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchInvitationLookup.mockResolvedValue({ orgName: "Calm Haven", orgSlug: "calm-haven" });
    mocks.registerInvitedUser.mockResolvedValue({ status: "created" });
    mocks.signInBrowserWithPassword.mockResolvedValue({ error: null });
    mocks.acceptInvitation.mockResolvedValue({ orgSlug: "calm-haven" });
    mocks.recordCurrentTermsAcceptance.mockResolvedValue(undefined);
    mocks.signOutFromBrowser.mockResolvedValue(undefined);
  });

  it("shows a recoverable login route when the link has no invitation token", async () => {
    setLocation("");

    render(
      <StrictMode>
        <AcceptInvitePage />
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: "Invalid link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to login" })).toBeInTheDocument();
    expect(mocks.fetchInvitationLookup).not.toHaveBeenCalled();
  });

  it("accepts a valid invitation then directs the user to the accepted organization", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    render(
      <StrictMode>
        <AcceptInvitePage />
      </StrictMode>,
    );

    expect(await screen.findByText("Calm Haven")).toBeInTheDocument();
    expect(screen.getByDisplayValue("new.user@example.com")).toHaveAttribute("readonly");

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "strong-password" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Set Password & Accept" }));

    await waitFor(() => {
      expect(mocks.registerInvitedUser).toHaveBeenCalledWith({
        token: "invite-token",
        email: "new.user@example.com",
        password: "strong-password",
      });
      expect(mocks.signInBrowserWithPassword).toHaveBeenCalledWith({
        email: "new.user@example.com",
        password: "strong-password",
      });
      expect(mocks.acceptInvitation).toHaveBeenCalledWith("invite-token");
    });

    expect(await screen.findByRole("heading", { name: "You're all set" })).toBeInTheDocument();
    expect(mocks.recordCurrentTermsAcceptance).toHaveBeenCalledOnce();
    expect(mocks.signOutFromBrowser).toHaveBeenCalledWith("global");
  });

  it("returns to a usable form when invitation acceptance fails", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.acceptInvitation.mockRejectedValue(new Error("Invitation expired"));
    render(<AcceptInvitePage />);

    await screen.findByText("Calm Haven");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "strong-password" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Set Password & Accept" }));

    expect(await screen.findByText(/invitation is no longer valid/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Password & Accept" })).not.toBeDisabled();
    expect(mocks.signOutFromBrowser).not.toHaveBeenCalled();
  });
});
