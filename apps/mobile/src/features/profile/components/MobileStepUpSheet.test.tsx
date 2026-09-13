import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";
import { MobileStepUpSheet } from "./MobileStepUpSheet";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("../../../shared/components/BottomSheetModal", async () => {
  const React = await import("react");
  return {
    BottomSheetModal: ({
      children,
      footer,
    }: {
      children: React.ReactNode;
      footer: React.ReactNode;
    }) => (
      <div role="alert">
        {children}
        {footer}
      </div>
    ),
    SheetHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
    SheetActions: ({
      children,
      primaryAction,
    }: {
      children: React.ReactNode;
      primaryAction: React.ReactNode;
    }) => (
      <div>
        {children}
        {primaryAction}
      </div>
    ),
  };
});
vi.mock("../../../shared/components/Button", () => ({
  Button: ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress: () => void | Promise<unknown>;
  }) => (
    <button disabled={disabled} onClick={() => void onPress()}>
      {label}
    </button>
  ),
}));

describe("MobileStepUpSheet", () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onConfirm.mockResolvedValue(undefined);
  });

  it("requests a password, clears it before submission, and reports proof errors inline", async () => {
    render(
      <MobileStepUpSheet
        error="That password did not match."
        method="password"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByText("That password did not match.")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "test-password" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));

    expect(onConfirm).toHaveBeenCalledWith("test-password");
    expect(input).toHaveValue("");
  });

  it("accepts only six authenticator digits and cancels without submitting", () => {
    render(
      <MobileStepUpSheet error={null} method="totp" onCancel={onCancel} onConfirm={onConfirm} />,
    );

    const input = screen.getByLabelText("Authenticator code");
    fireEvent.change(input, { target: { value: "12a34567" } });
    expect(input).toHaveValue("123456");
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
