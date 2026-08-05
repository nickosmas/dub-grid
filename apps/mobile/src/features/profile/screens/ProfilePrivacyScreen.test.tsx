import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

const getStoredConsent = vi.fn();
const setStoredConsent = vi.fn();
const pushToast = vi.fn();

vi.mock("../../consent/lib/consent", () => ({
  getStoredConsent: (...args: unknown[]) => getStoredConsent(...args),
  setStoredConsent: (...args: unknown[]) => setStoredConsent(...args),
  getLegalUrls: () => ({
    privacy: "https://app.dubgrid.com/privacy",
    terms: "https://app.dubgrid.com/terms",
    cookies: "https://app.dubgrid.com/cookie-policy",
  }),
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast: (...args: unknown[]) => pushToast(...args) }),
}));

import ProfilePrivacyScreen from "./ProfilePrivacyScreen";

describe("ProfilePrivacyScreen", () => {
  beforeEach(() => {
    getStoredConsent.mockReset();
    setStoredConsent.mockReset();
    setStoredConsent.mockResolvedValue(undefined);
  });

  it("reflects the stored analytics consent once loaded", async () => {
    getStoredConsent.mockResolvedValue({ analytics: true });

    render(<ProfilePrivacyScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText("Analytics consent")).toBeChecked();
    });
  });

  it("defaults to unchecked when there is no stored consent yet", async () => {
    getStoredConsent.mockResolvedValue(null);

    render(<ProfilePrivacyScreen />);

    await waitFor(() => {
      expect(getStoredConsent).toHaveBeenCalled();
    });
    expect(screen.getByLabelText("Analytics consent")).not.toBeChecked();
  });

  it("persists the new value when the analytics toggle is flipped", async () => {
    getStoredConsent.mockResolvedValue({ analytics: false });

    render(<ProfilePrivacyScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText("Analytics consent")).not.toBeChecked();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Analytics consent"));
    });

    expect(setStoredConsent).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText("Analytics consent")).toBeChecked();
  });

  it("opens the correct legal URL for each policy link", async () => {
    getStoredConsent.mockResolvedValue(null);
    const { Linking } = await import("react-native");
    const openURL = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);

    render(<ProfilePrivacyScreen />);

    fireEvent.click(screen.getByText("Privacy policy"));
    expect(openURL).toHaveBeenLastCalledWith("https://app.dubgrid.com/privacy");

    fireEvent.click(screen.getByText("Terms of service"));
    expect(openURL).toHaveBeenLastCalledWith("https://app.dubgrid.com/terms");

    fireEvent.click(screen.getByText("Cookie policy"));
    expect(openURL).toHaveBeenLastCalledWith("https://app.dubgrid.com/cookie-policy");
  });
});
