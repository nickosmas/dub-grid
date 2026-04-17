import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PermissionsEditor from "@/components/PermissionsEditor";

describe("PermissionsEditor", () => {
  it("enables Save only after a real permission change and disables it when reverted", async () => {
    const user = userEvent.setup();

    render(
      <PermissionsEditor
        title="Permissions"
        subtitle="Test subtitle"
        initialPermissions={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /select all/i }));
    expect(saveButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /clear all/i }));
    expect(saveButton).toBeDisabled();
  });
});
