import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Toolbar from "@/components/Toolbar";
import { FocusArea } from "@/types";

const defaultFocusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "North",
    colorBg: "#EFF6FF",
    colorText: "#1D4ED8",
    sortOrder: 1,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "South",
    colorBg: "#F0FDF4",
    colorText: "#166534",
    sortOrder: 2,
  },
];

const defaultProps = {
  weekStart: new Date(2024, 0, 7), // Jan 7, 2024 (Sunday)
  spanWeeks: 1 as const,
  activeFocusArea: null as number | null,
  staffSearch: "",
  focusAreas: defaultFocusAreas,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onToday: vi.fn(),
  onSpanChange: vi.fn(),
  onFocusAreaChange: vi.fn(),
  onStaffSearchChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Toolbar — schedule mode rendering", () => {
  it("renders ‹ previous button", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "‹" })).toBeInTheDocument();
  });

  it("renders Today button", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
  });

  it("renders › next button", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "›" })).toBeInTheDocument();
  });

  it("renders date label showing the current period", () => {
    render(<Toolbar {...defaultProps} spanWeeks={1} />);
    // Date range label is shown as text (e.g. "1/7 – 1/13"), not a button
    expect(screen.getByText(/\d{1,2}\/\d{1,2}/)).toBeInTheDocument();
  });

  it("renders All focus area button plus one per focus area in focusAreas prop", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "North" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "South" })).toBeInTheDocument();
  });

  it("renders staff search input with placeholder Find staff…", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByPlaceholderText("Find staff…")).toBeInTheDocument();
  });
});

describe("Toolbar — Tools dropdown", () => {
  it("renders Print inside Tools dropdown", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onPrintOpen={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Tools/i }));
    expect(screen.getByRole("menuitem", { name: /Print/i })).toBeInTheDocument();
  });

  it("Print calls onPrintOpen when clicked from Tools dropdown", async () => {
    const user = userEvent.setup();
    const onPrintOpen = vi.fn();
    render(<Toolbar {...defaultProps} onPrintOpen={onPrintOpen} />);
    await user.click(screen.getByRole("button", { name: /Tools/i }));
    await user.click(screen.getByRole("menuitem", { name: /Print/i }));
    expect(onPrintOpen).toHaveBeenCalledOnce();
  });
});

describe("Toolbar — active state styles", () => {
  it("date label updates when spanWeeks changes", () => {
    const { rerender } = render(<Toolbar {...defaultProps} spanWeeks={1} />);
    // 1 week: shows M/D – M/D
    expect(screen.getByText(/\d{1,2}\/\d{1,2} – \d{1,2}\/\d{1,2}/)).toBeInTheDocument();
    rerender(<Toolbar {...defaultProps} spanWeeks="month" />);
    // Month: shows MonthName YYYY
    expect(screen.getByText(/[A-Z][a-z]+ \d{4}/)).toBeInTheDocument();
  });

  it("active focus area button (matching activeFocusArea) has 'active' CSS class; others do not", () => {
    render(<Toolbar {...defaultProps} activeFocusArea={1} />);
    const northBtn = screen.getByRole("button", { name: "North" });
    const allBtn = screen.getByRole("button", { name: "All" });
    expect(northBtn.className).toContain("active");
    expect(allBtn.className).not.toContain("active");
  });
});

describe("Toolbar — callbacks", () => {
  it("clicking ‹ calls onPrev", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "‹" }));
    expect(defaultProps.onPrev).toHaveBeenCalledTimes(1);
  });

  it("clicking › calls onNext", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "›" }));
    expect(defaultProps.onNext).toHaveBeenCalledTimes(1);
  });

  it("clicking Today calls onToday", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(defaultProps.onToday).toHaveBeenCalledTimes(1);
  });

  // Span selector was removed from Toolbar — span changes are now handled
  // externally. Only nav callbacks (prev/next/today) remain.

  it("clicking a focus area button calls onFocusAreaChange with focus area id", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "North" }));
    expect(defaultProps.onFocusAreaChange).toHaveBeenCalledWith(1);
  });
});

describe("Toolbar — staff search", () => {
  it("× clear button appears when staffSearch is non-empty", () => {
    render(<Toolbar {...defaultProps} staffSearch="Alice" />);
    expect(screen.getByRole("button", { name: "×" })).toBeInTheDocument();
  });

  it("× clear button is absent when staffSearch is empty", () => {
    render(<Toolbar {...defaultProps} staffSearch="" />);
    expect(screen.queryByRole("button", { name: "×" })).not.toBeInTheDocument();
  });

  it("clicking × calls onStaffSearchChange with empty string", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} staffSearch="Alice" />);
    await user.click(screen.getByRole("button", { name: "×" }));
    expect(defaultProps.onStaffSearchChange).toHaveBeenCalledWith("");
  });

  it("typing in search input calls onStaffSearchChange with typed value", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Find staff…");
    await user.type(input, "B");
    // The input is controlled (value=staffSearch stays ""), so each keystroke fires
    // onChange with just that character. Verify the callback was invoked with "B".
    expect(defaultProps.onStaffSearchChange).toHaveBeenCalledWith("B");
  });
});

// ─── Property-Based Tests ────────────────────────────────────────────────────
import * as fc from "fast-check";

describe("Toolbar — property tests", () => {
  // Feature: ui-ux-test-suite, Property 1: Week label format for numeric spans
  it("week label always matches M/D – M/D for spans 1 and 2", () => {
    // Validates: Requirements 2.9, 2.10, 8.1
    const arbDate = fc
      .date({ min: new Date(2000, 0, 1), max: new Date(2030, 11, 31) })
      .filter((d) => !isNaN(d.getTime()));
    const arbNumericSpan = fc.constantFrom(1 as const, 2 as const);

    fc.assert(
      fc.property(arbDate, arbNumericSpan, (date, span) => {
        const { unmount } = render(
          <Toolbar {...defaultProps} weekStart={date} spanWeeks={span} />,
        );
        const label = screen.getByText(/\d{1,2}\/\d{1,2}/);
        const result = /^\d{1,2}\/\d{1,2} – \d{1,2}\/\d{1,2}$/.test(
          label.textContent ?? "",
        );
        unmount();
        return result;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ui-ux-test-suite, Property 2: Month label format
  it("month label always matches MonthName YYYY when spanWeeks is month", () => {
    // Validates: Requirements 2.11
    const arbDate = fc
      .date({ min: new Date(2000, 0, 1), max: new Date(2030, 11, 31) })
      .filter((d) => !isNaN(d.getTime()));

    fc.assert(
      fc.property(arbDate, (date) => {
        const { unmount } = render(
          <Toolbar {...defaultProps} weekStart={date} spanWeeks="month" />,
        );
        const label = screen.getByText(/^[A-Za-z]+ \d{4}$/);
        const result = /^[A-Za-z]+ \d{4}$/.test(label.textContent ?? "");
        unmount();
        return result;
      }),
      { numRuns: 100 },
    );
  });
});
