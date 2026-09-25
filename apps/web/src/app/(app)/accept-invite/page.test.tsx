import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { formatInvitationExpiry } from "@/emails/invitation-expiry";
import { DEAD_INVITATION_MESSAGE } from "@/lib/auth/dead-invitation";
import { describeDeadInvitation } from "./acceptFailure";
import AcceptInvitePage from "./page";

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  fetchInvitationLookup: vi.fn(),
  recordCurrentTermsAcceptance: vi.fn(),
  registerInvitedUser: vi.fn(),
  signInBrowserWithPassword: vi.fn(),
  signOutFromBrowser: vi.fn(),
  recordBrowserSignInCompleted: vi.fn(),
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
  recordBrowserSignInCompleted: mocks.recordBrowserSignInCompleted,
}));
vi.mock("@/features/organization/client", () => ({ acceptInvitation: mocks.acceptInvitation }));
vi.mock("@/components/profile/MFAVerify", () => ({
  MFAVerify: ({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void }) => (
    <section>
      <h1>Two-factor verification</h1>
      <button onClick={onVerified}>Verify code</button>
      <button onClick={onCancel}>Back to sign in</button>
    </section>
  ),
}));

function requestError(status: number, code: string | null, message = "Request failed") {
  return Object.assign(new Error(message), { status, code });
}

async function submitNewPassword() {
  await screen.findByText("Calm Haven");
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "strong-password" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Set Password & Accept" }));
}

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
    mocks.fetchInvitationLookup.mockResolvedValue({
      orgName: "Calm Haven",
      orgSlug: "calm-haven",
      expiresAt: null,
    });
    mocks.registerInvitedUser.mockResolvedValue({ status: "created" });
    mocks.signInBrowserWithPassword.mockResolvedValue({ error: null });
    mocks.acceptInvitation.mockResolvedValue({ orgSlug: "calm-haven" });
    mocks.recordCurrentTermsAcceptance.mockResolvedValue(undefined);
    mocks.signOutFromBrowser.mockResolvedValue(undefined);
    mocks.recordBrowserSignInCompleted.mockResolvedValue(undefined);
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
    // The acceptance's sign-in is recorded while its session still exists.
    expect(mocks.recordBrowserSignInCompleted).toHaveBeenCalledOnce();
    expect(mocks.recordBrowserSignInCompleted.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOutFromBrowser.mock.invocationCallOrder[0],
    );
  });

  it("records no sign-in when the password is refused", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.registerInvitedUser.mockResolvedValue({ status: "existing" });
    mocks.signInBrowserWithPassword.mockResolvedValue({
      error: Object.assign(new Error("Invalid login credentials"), { status: 400 }),
    });
    render(<AcceptInvitePage />);

    await submitNewPassword();

    await waitFor(() => expect(mocks.signInBrowserWithPassword).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: /accept/i })).toBeEnabled());
    expect(mocks.recordBrowserSignInCompleted).not.toHaveBeenCalled();
  });

  it("returns to a usable form when acceptance fails in a way a retry can fix", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.acceptInvitation.mockRejectedValue(requestError(500, null));
    render(<AcceptInvitePage />);

    await submitNewPassword();

    expect(await screen.findByText(/couldn't accept your invitation just now/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Set Password & Accept" })).not.toBeDisabled();
    expect(mocks.signOutFromBrowser).not.toHaveBeenCalled();
  });

  // The link was live when the page opened and died before submit (reissued,
  // revoked or past its deadline): the dead-on-arrival card, not a form error.
  it("sends a link that dies mid-page to the dead-link card, saying the account exists", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.acceptInvitation.mockRejectedValue(requestError(404, "INVITATION_INVALID"));
    render(<AcceptInvitePage />);

    await submitNewPassword();

    expect(
      await screen.findByRole("heading", { name: "Invitation no longer valid" }),
    ).toBeInTheDocument();
    expect(screen.getByText(describeDeadInvitation(true))).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    // The session this attempt opened goes; there is nothing left to accept.
    expect(mocks.signOutFromBrowser).toHaveBeenCalledWith("local");
  });

  it("sends a link that dies before the account step to the plain card", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.registerInvitedUser.mockRejectedValue(requestError(404, "INVITATION_INVALID"));
    render(<AcceptInvitePage />);

    await submitNewPassword();

    expect(await screen.findByText(DEAD_INVITATION_MESSAGE)).toBeInTheDocument();
    expect(mocks.signInBrowserWithPassword).not.toHaveBeenCalled();
    // Nothing was signed in, so no session is touched.
    expect(mocks.signOutFromBrowser).not.toHaveBeenCalled();
  });

  it("sends a link that dies during the second-factor challenge to the card", async () => {
    setLocation("?token=invite-token&email=enrolled%40example.com");
    mocks.registerInvitedUser.mockResolvedValue({ status: "existing" });
    mocks.acceptInvitation
      .mockRejectedValueOnce(requestError(403, "STEP_UP_REQUIRED"))
      .mockRejectedValueOnce(requestError(404, "INVITATION_INVALID"));
    render(<AcceptInvitePage />);

    await submitNewPassword();
    fireEvent.click(await screen.findByRole("button", { name: "Verify code" }));

    expect(await screen.findByText(DEAD_INVITATION_MESSAGE)).toBeInTheDocument();
    expect(mocks.signOutFromBrowser).toHaveBeenCalledWith("local");
  });

  it("challenges an account with a second factor, then accepts on the promoted session", async () => {
    setLocation("?token=invite-token&email=enrolled%40example.com");
    mocks.registerInvitedUser.mockResolvedValue({ status: "existing" });
    mocks.acceptInvitation
      .mockRejectedValueOnce(requestError(403, "STEP_UP_REQUIRED", "Confirm your identity"))
      .mockResolvedValueOnce({ orgSlug: "calm-haven" });
    render(<AcceptInvitePage />);

    await submitNewPassword();

    expect(await screen.findByRole("heading", { name: "Two-factor verification" })).toBeVisible();
    expect(screen.queryByText(/no longer valid/i)).not.toBeInTheDocument();
    expect(mocks.signOutFromBrowser).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    expect(await screen.findByRole("heading", { name: "You're all set" })).toBeInTheDocument();
    expect(mocks.acceptInvitation).toHaveBeenCalledTimes(2);
    // Once after the password (which the server refuses for this account) and
    // once after the code, which it records.
    expect(mocks.recordBrowserSignInCompleted).toHaveBeenCalledTimes(2);
    expect(mocks.signOutFromBrowser).toHaveBeenCalledWith("global");
  });

  it("drops the password-only session when the invitee backs out of the challenge", async () => {
    setLocation("?token=invite-token&email=enrolled%40example.com");
    mocks.registerInvitedUser.mockResolvedValue({ status: "existing" });
    mocks.acceptInvitation.mockRejectedValue(requestError(403, "STEP_UP_REQUIRED"));
    render(<AcceptInvitePage />);

    await submitNewPassword();
    fireEvent.click(await screen.findByRole("button", { name: "Back to sign in" }));

    expect(await screen.findByRole("heading", { name: "Accept invitation" })).toBeInTheDocument();
    expect(mocks.signOutFromBrowser).toHaveBeenCalledWith("local");
  });

  it("does not call a transient failure a dead invitation", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.acceptInvitation.mockRejectedValue(requestError(503, null));
    render(<AcceptInvitePage />);

    await submitNewPassword();

    expect(await screen.findByText(/couldn't accept your invitation just now/i)).toBeVisible();
    expect(screen.queryByText(/no longer valid|no longer works/i)).not.toBeInTheDocument();
  });

  it("does not claim an account was created for an existing account's dead link", async () => {
    setLocation("?token=invite-token&email=existing%40example.com");
    mocks.registerInvitedUser.mockResolvedValue({ status: "existing" });
    mocks.acceptInvitation.mockRejectedValue(requestError(404, "INVITATION_INVALID"));
    render(<AcceptInvitePage />);

    await submitNewPassword();

    expect(await screen.findByText(DEAD_INVITATION_MESSAGE)).toBeVisible();
    expect(screen.queryByText(/account was created/i)).not.toBeInTheDocument();
  });

  it("never shows the form for a dead link", async () => {
    setLocation("?token=dead-token&email=someone%40example.com");
    mocks.fetchInvitationLookup.mockRejectedValue(requestError(404, "INVITATION_INVALID"));
    render(<AcceptInvitePage />);

    expect(
      await screen.findByRole("heading", { name: "Invitation no longer valid" }),
    ).toBeInTheDocument();
    expect(screen.getByText(DEAD_INVITATION_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to login" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("holds the form back until the lookup has answered", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.fetchInvitationLookup.mockReturnValue(new Promise(() => undefined));
    render(<AcceptInvitePage />);

    expect(await screen.findByRole("heading", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("still shows the form when the lookup itself fails", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.fetchInvitationLookup.mockRejectedValue(requestError(503, null));
    render(<AcceptInvitePage />);

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Invitation no longer valid" }),
    ).not.toBeInTheDocument();
    // No lookup, no deadline: the page does not guess one.
    expect(screen.queryByText(/This invitation expires/)).not.toBeInTheDocument();
  });

  it("states a live link's deadline in the viewer's own timezone", async () => {
    setLocation("?token=invite-token&email=new.user%40example.com");
    mocks.fetchInvitationLookup.mockResolvedValue({
      orgName: "Calm Haven",
      orgSlug: "calm-haven",
      expiresAt: "2026-09-28T22:04:00.000Z",
    });
    render(<AcceptInvitePage />);

    const local = formatInvitationExpiry(
      "2026-09-28T22:04:00.000Z",
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(await screen.findByText(`This invitation expires on ${local}.`)).toBeInTheDocument();
  });
});
