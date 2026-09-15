import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepUpForm } from "./StepUpForm";

describe("StepUpForm", () => {
  it("accepts only six numeric TOTP digits and preserves leading zeros", async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    render(<StepUpForm method="totp" error={null} onConfirm={confirm} onCancel={vi.fn()} />);
    const field = screen.getByLabelText("Authenticator code");
    fireEvent.change(field, { target: { value: "a0012" } });
    expect(field).toHaveValue("0012");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "a0012347" } });
    expect(field).toHaveValue("001234");
    await act(async () => fireEvent.submit(field.closest("form")!));
    expect(confirm).toHaveBeenCalledExactlyOnceWith("001234");
    expect(field).toHaveValue("");
  });

  it("blocks synchronous reentry and cancellation until confirmation settles", async () => {
    let finish!: () => void;
    const confirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const cancel = vi.fn();
    const busy = vi.fn();
    render(
      <StepUpForm
        method="password"
        error={null}
        onConfirm={confirm}
        onCancel={cancel}
        onBusyChange={busy}
      />,
    );
    const field = screen.getByLabelText("Password");
    fireEvent.change(field, { target: { value: "test-password" } });
    act(() => {
      fireEvent.submit(field.closest("form")!);
      fireEvent.submit(field.closest("form")!);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    expect(busy).toHaveBeenCalledExactlyOnceWith(true);
    expect(field).toHaveValue("");
    expect(field).toBeDisabled();
    await act(async () => finish());
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("renders a safe linked error when a confirmation unexpectedly rejects", async () => {
    render(
      <StepUpForm
        method="password"
        error={null}
        onConfirm={vi.fn().mockRejectedValue(new Error("private details"))}
        onCancel={vi.fn()}
      />,
    );
    const field = screen.getByLabelText("Password");
    fireEvent.change(field, { target: { value: "test-password" } });
    await act(async () => fireEvent.submit(field.closest("form")!));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't confirm your identity. Try again.",
    );
    expect(field).toHaveAccessibleDescription("We couldn't confirm your identity. Try again.");
    expect(field).toHaveValue("");
    expect(screen.queryByText("private details")).not.toBeInTheDocument();
  });

  it("does not submit an externally disabled challenge even through a form event", async () => {
    const confirm = vi.fn();
    const { rerender } = render(
      <StepUpForm method="password" error={null} onConfirm={confirm} onCancel={vi.fn()} />,
    );
    const field = screen.getByLabelText("Password");
    fireEvent.change(field, { target: { value: "test-password" } });
    rerender(
      <StepUpForm method="password" error={null} onConfirm={confirm} onCancel={vi.fn()} disabled />,
    );
    await act(async () => fireEvent.submit(field.closest("form")!));
    expect(confirm).not.toHaveBeenCalled();
  });
});
