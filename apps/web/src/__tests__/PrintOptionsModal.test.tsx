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
    await user.click(screen.getByRole("button", { name: /Preview/i }));

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

    await user.click(screen.getByRole("button", { name: "2 Weeks" }));
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^close$/i }));

    expect(
      await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("prints full shift names one week at a time", async () => {
    const user = userEvent.setup();
    const onPrint = vi.fn();
    render(
      <PrintOptionsModal
        focusAreas={focusAreas}
        currentSpanWeeks="month"
        onPrint={onPrint}
        onClose={vi.fn()}
        shiftDisplayMode="name"
      />,
    );

    expect(screen.getByRole("button", { name: "2 Weeks" })).toBeDisabled();
    expect(screen.getByText("Full shift names print one week at a time.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Preview/i }));

    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ spanWeeks: 1 }));
  });

  it("offers no month, and prints a month on screen as its first two weeks", async () => {
    const user = userEvent.setup();
    const onPrint = vi.fn();
    render(
      <PrintOptionsModal
        focusAreas={focusAreas}
        currentSpanWeeks="month"
        onPrint={onPrint}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Month" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Preview/i }));

    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ spanWeeks: 2 }));
  });
});
