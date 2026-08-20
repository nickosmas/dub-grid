import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, keyboardDismissMock } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

const needsConsentDecision = vi.fn();
const setStoredConsent = vi.fn();
const clearStoredConsent = vi.fn();

vi.mock("../lib/consent", () => ({
  needsConsentDecision: (...args: unknown[]) => needsConsentDecision(...args),
  setStoredConsent: (...args: unknown[]) => setStoredConsent(...args),
  clearStoredConsent: (...args: unknown[]) => clearStoredConsent(...args),
  getLegalUrls: () => ({
    privacy: "https://example.test/privacy",
    terms: "https://example.test/terms",
    cookies: "https://example.test/cookie-policy",
  }),
}));

import { ConsentGate, useIsConsentDecisionPending, useRecheckConsentDecision } from "./ConsentGate";

function PendingProbe() {
  return <div>pending:{String(useIsConsentDecisionPending())}</div>;
}

function renderGate() {
  return render(
    <ConsentGate>
      <div>app-content</div>
    </ConsentGate>,
  );
}

describe("ConsentGate", () => {
  beforeEach(() => {
    needsConsentDecision.mockReset();
    setStoredConsent.mockReset();
    keyboardDismissMock.mockClear();
    setStoredConsent.mockResolvedValue(undefined);
  });

  it("prompts when no decision has been stored yet", async () => {
    needsConsentDecision.mockResolvedValue(true);

    renderGate();

    expect(await screen.findByText("Your privacy")).toBeInTheDocument();
  });

  it("stays out of the way once a current decision exists", async () => {
    needsConsentDecision.mockResolvedValue(false);

    renderGate();

    await waitFor(() => {
      expect(needsConsentDecision).toHaveBeenCalled();
    });
    expect(screen.queryByText("Your privacy")).not.toBeInTheDocument();
  });

  // The storage read is async; prompting before it resolves would flash the
  // sheet at every launch for users who already decided.
  it("does not prompt while the stored decision is still being read", () => {
    needsConsentDecision.mockReturnValue(new Promise(() => {}));

    renderGate();

    expect(screen.queryByText("Your privacy")).not.toBeInTheDocument();
    expect(screen.getByText("app-content")).toBeInTheDocument();
  });

  it("records an opt-in and dismisses", async () => {
    needsConsentDecision.mockResolvedValue(true);

    renderGate();
    fireEvent.click(await screen.findByText("Accept all"));

    await waitFor(() => {
      expect(setStoredConsent).toHaveBeenCalledWith(true);
    });
    await waitFor(() => {
      expect(screen.queryByText("Your privacy")).not.toBeInTheDocument();
    });
  });

  it("records an essential-only choice as a decline of analytics", async () => {
    needsConsentDecision.mockResolvedValue(true);

    renderGate();
    fireEvent.click(await screen.findByText("Essential only"));

    await waitFor(() => {
      expect(setStoredConsent).toHaveBeenCalledWith(false);
    });
  });

  // The storage read resolves after login is interactive, so the user may
  // already be typing. An iOS modal leaves the presenting window's keyboard up,
  // covering this bottom sheet with a still-focused field behind it.
  it("closes the keyboard on the screen behind before prompting", async () => {
    needsConsentDecision.mockResolvedValue(true);

    renderGate();

    expect(await screen.findByText("Your privacy")).toBeInTheDocument();
    expect(keyboardDismissMock).toHaveBeenCalled();
  });

  it("leaves the keyboard alone when there is nothing to prompt for", async () => {
    needsConsentDecision.mockResolvedValue(false);

    renderGate();

    await waitFor(() => {
      expect(needsConsentDecision).toHaveBeenCalled();
    });
    expect(keyboardDismissMock).not.toHaveBeenCalled();
  });

  // `npm run db:reset` wipes the database but can't reach device storage, so
  // the dev first-run reset clears consent on a running app. The gate reads
  // storage once at mount, so it has to be told to look again.
  it("re-opens the sheet when a reset clears the stored decision", async () => {
    needsConsentDecision.mockResolvedValue(false);

    function DevResetButton() {
      const recheck = useRecheckConsentDecision();
      return (
        <button type="button" onClick={recheck}>
          dev-reset
        </button>
      );
    }

    render(
      <ConsentGate>
        <DevResetButton />
      </ConsentGate>,
    );

    await waitFor(() => {
      expect(needsConsentDecision).toHaveBeenCalled();
    });
    expect(screen.queryByText("Your privacy")).not.toBeInTheDocument();

    needsConsentDecision.mockResolvedValue(true);
    fireEvent.click(screen.getByText("dev-reset"));

    expect(await screen.findByText("Your privacy")).toBeInTheDocument();
  });

  // Handing the URL to Safari would drop the user out of a sheet they still
  // have to answer, and they'd have to relaunch the app to get back.
  it("reads the cookie policy in an in-app browser", async () => {
    needsConsentDecision.mockResolvedValue(true);
    const { openedUrls } = await import("../../../test/shims/expo-web-browser");
    openedUrls.length = 0;

    renderGate();
    fireEvent.click(await screen.findByText("Read our cookie policy"));

    await waitFor(() => {
      expect(openedUrls.at(-1)?.url).toBe("https://example.test/cookie-policy");
    });
    expect(screen.getByText("Your privacy")).toBeInTheDocument();
  });

  // Children render underneath and can't otherwise tell the sheet is coming, so
  // they'd race it — login auto-focuses a field, raising the keyboard over it.
  it("tells the app below to wait while the decision is unresolved", async () => {
    let resolveDecision: (needed: boolean) => void = () => {};
    needsConsentDecision.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveDecision = resolve;
      }),
    );

    render(
      <ConsentGate>
        <PendingProbe />
      </ConsentGate>,
    );

    expect(screen.getByText(/^pending:/).textContent).toBe("pending:true");

    resolveDecision(true);
    expect(await screen.findByText("Your privacy")).toBeInTheDocument();
    expect(screen.getByText(/^pending:/).textContent).toBe("pending:true");

    fireEvent.click(screen.getByText("Accept all"));

    await waitFor(() => {
      expect(screen.getByText(/^pending:/).textContent).toBe("pending:false");
    });
  });

  it("clears the wait immediately when no prompt is needed", async () => {
    needsConsentDecision.mockResolvedValue(false);

    render(
      <ConsentGate>
        <PendingProbe />
      </ConsentGate>,
    );

    await waitFor(() => {
      expect(screen.getByText(/^pending:/).textContent).toBe("pending:false");
    });
  });

  // The children render underneath the sheet so the app is warm behind it,
  // but the modal is what actually blocks interaction.
  it("keeps rendering the app underneath the sheet", async () => {
    needsConsentDecision.mockResolvedValue(true);

    renderGate();

    expect(await screen.findByText("Your privacy")).toBeInTheDocument();
    expect(screen.getByText("app-content")).toBeInTheDocument();
  });
});
