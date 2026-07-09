import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CompletionStep from "@/components/onboarding/steps/CompletionStep";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("CompletionStep", () => {
  it("sends a regular user to the dashboard, not the schedule", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<CompletionStep role="user" onComplete={onComplete} />);

    expect(screen.getByRole("button", { name: /go to dashboard/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /go to dashboard/i }));

    expect(onComplete).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(push).not.toHaveBeenCalledWith("/schedule");
  });

  it("sends a super admin finishing org setup to the dashboard", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<CompletionStep role="super_admin" onComplete={onComplete} isOrgSetup />);

    await userEvent.click(screen.getByRole("button", { name: /go to dashboard/i }));

    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("sends a super admin finishing their own onboarding to the people page", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<CompletionStep role="super_admin" onComplete={onComplete} />);

    await userEvent.click(screen.getByRole("button", { name: /go to people/i }));

    expect(push).toHaveBeenCalledWith("/people");
  });
});
