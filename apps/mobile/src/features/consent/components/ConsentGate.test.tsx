import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

const needsConsentDecision = vi.fn();
const setStoredConsent = vi.fn();

vi.mock("../lib/consent", () => ({
  needsConsentDecision: (...args: unknown[]) => needsConsentDecision(...args),
  setStoredConsent: (...args: unknown[]) => setStoredConsent(...args),
  getLegalUrls: () => ({
    privacy: "https://example.test/privacy",
    terms: "https://example.test/terms",
    cookies: "https://example.test/cookie-policy",
  }),
}));

import { ConsentGate } from "./ConsentGate";

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

  // The children render underneath the sheet so the app is warm behind it,
  // but the modal is what actually blocks interaction.
  it("keeps rendering the app underneath the sheet", async () => {
    needsConsentDecision.mockResolvedValue(true);

    renderGate();

    expect(await screen.findByText("Your privacy")).toBeInTheDocument();
    expect(screen.getByText("app-content")).toBeInTheDocument();
  });
});
