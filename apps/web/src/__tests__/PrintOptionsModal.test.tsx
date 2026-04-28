import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import PrintOptionsModal from "@/components/PrintOptionsModal";
import type { FocusArea } from "@/types";

const focusAreas: FocusArea[] = [
  { id: 1, orgId: "org-1", name: "North", sortOrder: 1, departmentId: null },
  { id: 2, orgId: "org-1", name: "South", sortOrder: 2, departmentId: null },
];

describe("PrintOptionsModal", () => {
  it("keeps all focus areas selected when the All toggle is clicked", async () => {
    const user = userEvent.setup();
    const onPrint = vi.fn();
    render(
      <PrintOptionsModal
        focusAreas={focusAreas}
        currentSpanWeeks={1}
        onPrint={onPrint}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText(/All Focus Areas/i));
    await user.click(screen.getByRole("button", { name: /Preview & Print/i }));

    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedFocusAreas: ["North", "South"],
      }),
    );
  });

  it("confirms before closing dirty print settings from the footer Close action", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <PrintOptionsModal
        focusAreas={focusAreas}
        currentSpanWeeks={1}
        onPrint={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^close$/i }));

    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
