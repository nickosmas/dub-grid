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
    sortOrder: 1,
    departmentId: null,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "South",
    sortOrder: 2,
    departmentId: null,
  },
];

const defaultProps = {
  weekStart: new Date(2024, 0, 7), // Jan 7, 2024 (Sunday)
  spanWeeks: 1 as const,
  activeFocusArea: null as number | null,
  staffSearch: "",
  sortBy: "seniority" as const,
  focusAreas: defaultFocusAreas,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onToday: vi.fn(),
  onSpanChange: vi.fn(),
  onFocusAreaChange: vi.fn(),
  onStaffSearchChange: vi.fn(),
  onSortByChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Toolbar — Schedule Builder button", () => {
  it("is a plain button with a calendar icon and no count", () => {
    render(<Toolbar {...defaultProps} onCoverageToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Schedule Builder" });
    expect(button).toHaveTextContent(/^Schedule Builder$/);
    expect(button.querySelector("svg.lucide-calendar-check")).not.toBeNull();
    expect(button.style.color).toBe("");
  });
});

describe("Toolbar — Shift requests button", () => {
  it("sits after Schedule Builder and opens the board", async () => {
    const user = userEvent.setup();
    const onRequestsToggle = vi.fn();
    render(
      <Toolbar
        {...defaultProps}
        onCoverageToggle={vi.fn()}
        onRequestsToggle={onRequestsToggle}
        requestsBadgeCount={3}
      />,
    );
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    const builder = buttons.indexOf("Schedule Builder");
    expect(buttons[builder + 1]).toBe("Shift requests3");
    await user.click(screen.getByRole("button", { name: /Shift requests/ }));
    expect(onRequestsToggle).toHaveBeenCalledOnce();
    const badge = screen
      .getByRole("button", { name: /Shift requests/ })
      .querySelector("[data-numeric-badge]");
    expect(badge).toHaveAttribute("data-tone", "danger");
  });

  it("always shows its count, a quiet 0 when nothing is waiting", () => {
    render(<Toolbar {...defaultProps} onRequestsToggle={vi.fn()} requestsBadgeCount={0} />);
    const badge = screen
      .getByRole("button", { name: /Shift requests/ })
      .querySelector("[data-numeric-badge]");
    expect(badge).toHaveTextContent("0");
    expect(badge).toHaveAttribute("data-tone", "neutral");
  });

  it("names the menu More tools, with its icon and a chevron", () => {
    render(<Toolbar {...defaultProps} onRequestsToggle={vi.fn()} onPublishHistory={vi.fn()} />);
    const button = screen.getByRole("button", { name: "More tools" });
    expect(button).toHaveTextContent(/^More tools$/);
    expect(button.querySelectorAll("svg")).toHaveLength(2);
    expect(button.lastElementChild).toHaveClass("lucide-chevron-down");
  });

  it("gives Shift requests an icon like its neighbors", () => {
    render(<Toolbar {...defaultProps} onRequestsToggle={vi.fn()} />);
    const button = screen.getByRole("button", { name: /Shift requests/ });
    expect(button.firstElementChild).toHaveClass("lucide-repeat");
  });

  it("leaves More tools without a count", () => {
    render(
      <Toolbar
        {...defaultProps}
        onRequestsToggle={vi.fn()}
        onPublishHistory={vi.fn()}
        requestsBadgeCount={4}
      />,
    );
    expect(
      screen.getByRole("button", { name: "More tools" }).querySelector("[data-numeric-badge]"),
    ).toBeNull();
  });
});

describe("Toolbar — schedule mode rendering", () => {
  it("renders previous period button", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Go to previous period" })).toBeInTheDocument();
  });

  it("renders Today button", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
  });

  it("renders next period button", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Go to next period" })).toBeInTheDocument();
  });

  it("renders date label showing the current period", () => {
    render(<Toolbar {...defaultProps} spanWeeks={1} />);
    // Date range label is shown as text (e.g. "1/7 - 1/13"), not a button
    expect(screen.getByText(/\d{1,2}\/\d{1,2}/)).toBeInTheDocument();
  });

  it("renders All focus area button plus one per focus area in focusAreas prop", () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "North" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "South" })).toBeInTheDocument();
  });

  it("opens staff search from its button and keeps the area tabs in view", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    expect(screen.queryByPlaceholderText("Search staff")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Search staff" }));
    expect(screen.getByPlaceholderText("Search staff")).toHaveFocus();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("collapses the buttons to its right to icons while the field is open", async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        {...defaultProps}
        onCoverageToggle={vi.fn()}
        onRequestsToggle={vi.fn()}
        onPublishHistory={vi.fn()}
      />,
    );
    const builder = screen.getByRole("button", { name: "Schedule Builder" });
    expect(builder).toHaveTextContent("Schedule Builder");
    await user.click(screen.getByRole("button", { name: "Search staff" }));
    expect(screen.getByRole("button", { name: "Schedule Builder" })).toHaveTextContent(/^$/);
    expect(screen.getByRole("button", { name: /Shift requests/ })).not.toHaveTextContent(
      "Shift requests",
    );
    expect(screen.getByRole("button", { name: "More tools" })).toHaveTextContent(/^$/);

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Schedule Builder" })).toHaveTextContent(
      "Schedule Builder",
    );
  });

  it("clears with Escape, then closes and hands focus back to its button", async () => {
    const user = userEvent.setup();
    const onStaffSearchChange = vi.fn();
    const { rerender } = render(
      <Toolbar {...defaultProps} staffSearch="Al" onStaffSearchChange={onStaffSearchChange} />,
    );
    await user.click(screen.getByRole("button", { name: /Search staff/ }));
    await user.keyboard("{Escape}");
    expect(onStaffSearchChange).toHaveBeenLastCalledWith("");
    rerender(
      <Toolbar {...defaultProps} staffSearch="" onStaffSearchChange={onStaffSearchChange} />,
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("Search staff")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search staff" })).toHaveFocus();
  });

  it("Close search clears the search and closes the field", async () => {
    const user = userEvent.setup();
    const onStaffSearchChange = vi.fn();
    render(
      <Toolbar {...defaultProps} staffSearch="Al" onStaffSearchChange={onStaffSearchChange} />,
    );
    await user.click(screen.getByRole("button", { name: /Search staff/ }));
    await user.click(screen.getByRole("button", { name: "Close search" }));
    expect(onStaffSearchChange).toHaveBeenCalledWith("");
    expect(screen.queryByPlaceholderText("Search staff")).not.toBeInTheDocument();
  });

  it("keeps an active search visible on its button once the field closes", () => {
    render(<Toolbar {...defaultProps} staffSearch="Mar" />);
    const button = screen.getByRole("button", { name: 'Search staff, showing "Mar"' });
    expect(button).toHaveClass("dg-btn-toggled");
  });

  it("shows Sort staff and the search field in full on a wide window", () => {
    const matchMedia = vi.mocked(window.matchMedia);
    const original = matchMedia.getMockImplementation();
    matchMedia.mockImplementation(
      (query: string) =>
        ({
          matches: query === "(min-width: 1700px)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    try {
      render(<Toolbar {...defaultProps} />);
      expect(screen.getByPlaceholderText("Search staff")).toBeVisible();
      expect(screen.getByRole("button", { name: "Sort staff" })).toHaveTextContent("Sort staff");
      expect(screen.queryByRole("button", { name: "Search staff" })).not.toBeInTheDocument();
    } finally {
      if (original) matchMedia.mockImplementation(original);
    }
  });

  it("shows sort as an icon button with its name", () => {
    render(<Toolbar {...defaultProps} />);
    const sort = screen.getByRole("button", { name: "Sort staff" });
    expect(sort).toHaveTextContent(/^$/);
  });
});

describe("Toolbar — Sort menu", () => {
  it("opens a dropdown with Seniority and Alphabetical options", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Sort staff" }));
    expect(screen.getByRole("menuitem", { name: /Seniority/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Alphabetical/i })).toBeInTheDocument();
  });

  it("marks the active sort option with a checkmark", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} sortBy="name" />);
    await user.click(screen.getByRole("button", { name: "Sort staff" }));
    const seniorityItem = screen.getByRole("menuitem", { name: /Seniority/i });
    const alphabeticalItem = screen.getByRole("menuitem", { name: /Alphabetical/i });
    expect(alphabeticalItem.querySelector(".lucide-check")).toBeInTheDocument();
    expect(seniorityItem.querySelector(".lucide-check")).not.toBeInTheDocument();
  });

  it("calls onSortByChange with the selected option and closes the menu", async () => {
    const user = userEvent.setup();
    const onSortByChange = vi.fn();
    render(<Toolbar {...defaultProps} sortBy="seniority" onSortByChange={onSortByChange} />);
    await user.click(screen.getByRole("button", { name: "Sort staff" }));
    await user.click(screen.getByRole("menuitem", { name: /Alphabetical/i }));
    expect(onSortByChange).toHaveBeenCalledExactlyOnceWith("name");
    expect(screen.queryByRole("menuitem", { name: /Alphabetical/i })).not.toBeInTheDocument();
  });
});

describe("Toolbar — Tools dropdown", () => {
  it("uses the shared switch visual for Authors without nesting another control", async () => {
    const user = userEvent.setup();
    const onAuditToggle = vi.fn();
    render(<Toolbar {...defaultProps} showAudit onAuditToggle={onAuditToggle} />);

    await user.click(screen.getByRole("button", { name: "More tools" }));
    const authorsItem = screen.getByRole("menuitem", { name: /Authors/i });
    const switchVisual = authorsItem.querySelector('[data-slot="switch"]');

    expect(switchVisual).toHaveAttribute("aria-hidden", "true");
    expect(switchVisual).toHaveStyle({ background: "var(--dg-color-brand)" });
    expect(authorsItem.querySelector('[role="switch"]')).not.toBeInTheDocument();

    await user.click(authorsItem);
    expect(onAuditToggle).toHaveBeenCalledOnce();
  });

  it("renders Print inside Tools dropdown", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onPrintOpen={vi.fn()} onPublishHistory={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "More tools" }));
    expect(screen.getByRole("menuitem", { name: /Print/i })).toBeInTheDocument();
  });

  it("Print calls onPrintOpen when clicked from Tools dropdown", async () => {
    const user = userEvent.setup();
    const onPrintOpen = vi.fn();
    render(<Toolbar {...defaultProps} onPrintOpen={onPrintOpen} onPublishHistory={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "More tools" }));
    await user.click(screen.getByRole("menuitem", { name: /Print/i }));
    expect(onPrintOpen).toHaveBeenCalledOnce();
  });

  it("uses an upload arrow for Export CSV", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} onExportCSV={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "More tools" }));
    const exportItem = screen.getByRole("menuitem", { name: /Export CSV/i });

    expect(exportItem.querySelector(".lucide-upload")).toBeInTheDocument();
  });

  it("uses an import arrow for Import Previous Schedule", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} canImportPrevious onImportPrevious={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "More tools" }));
    const importItem = screen.getByRole("menuitem", {
      name: /Import Previous Schedule/i,
    });

    expect(importItem.querySelector(".lucide-import")).toBeInTheDocument();
  });

  it("disables grid-dependent tools when the visible grid has no rows", async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        {...defaultProps}
        canApplyRecurringSchedule
        canImportPrevious
        hasVisibleGridRows={false}
        hasRemovableVisibleEntries={false}
        onApplyRecurring={vi.fn()}
        onBulkDeleteToggle={vi.fn()}
        onExportCSV={vi.fn()}
        onImportPrevious={vi.fn()}
        onPrintOpen={vi.fn()}
        onPublishHistory={vi.fn()}
        onRequestsToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More tools" }));

    expect(screen.queryByRole("menuitem", { name: /Requests/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Print/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /Export CSV/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /Publish History/i })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByRole("menuitem", { name: /Fill from Recurring Schedules/i }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /Import Previous Schedule/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /^Bulk Delete$/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables schedule-entry tools when visible staff rows have no schedule entries", async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        {...defaultProps}
        canApplyRecurringSchedule
        canImportPrevious
        hasVisibleGridRows
        hasVisibleScheduleEntries={false}
        hasRemovableVisibleEntries={false}
        onApplyRecurring={vi.fn()}
        onAuditToggle={vi.fn()}
        onBulkDeleteToggle={vi.fn()}
        onExportCSV={vi.fn()}
        onImportPrevious={vi.fn()}
        onPrintOpen={vi.fn()}
        onPublishHistory={vi.fn()}
        onRequestsToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More tools" }));

    expect(screen.queryByRole("menuitem", { name: /Requests/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Authors/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /Print/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /Export CSV/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /Publish History/i })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByRole("menuitem", { name: /Fill from Recurring Schedules/i }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /Import Previous Schedule/i })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /^Bulk Delete$/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("keeps bulk delete exit available even when no removable entries remain", async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        {...defaultProps}
        hasVisibleGridRows={false}
        hasRemovableVisibleEntries={false}
        isBulkDeleteMode
        onBulkDeleteToggle={vi.fn()}
        onRequestsToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More tools" }));

    expect(screen.getByRole("menuitem", { name: /Exit Bulk Delete/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Exit Bulk Delete/i })).not.toBeDisabled();
  });

  it("shows Import Previous Schedule when shift edits are allowed without recurring apply permission", async () => {
    const user = userEvent.setup();
    render(
      <Toolbar
        {...defaultProps}
        canImportPrevious
        canApplyRecurringSchedule={false}
        onImportPrevious={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More tools" }));
    expect(screen.getByRole("menuitem", { name: /Import Previous Schedule/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Fill from Recurring Schedules/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Fill from Recurring Schedules only when recurring apply permission is granted", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} canApplyRecurringSchedule onApplyRecurring={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "More tools" }));
    expect(
      screen.getByRole("menuitem", { name: /Fill from Recurring Schedules/i }),
    ).toBeInTheDocument();
  });
});

describe("Toolbar - someone who can't edit shifts", () => {
  it("has Shift requests and Print on the toolbar, with no More tools menu", async () => {
    const user = userEvent.setup();
    const onRequestsToggle = vi.fn();
    const onPrintOpen = vi.fn();
    render(
      <Toolbar
        {...defaultProps}
        requestsBadgeCount={2}
        onRequestsToggle={onRequestsToggle}
        onPrintOpen={onPrintOpen}
      />,
    );

    expect(screen.queryByRole("button", { name: "More tools" })).not.toBeInTheDocument();
    const requests = screen.getByRole("button", { name: /Shift requests/ });
    expect(requests.querySelector("[data-numeric-badge]")).toHaveTextContent("2");

    await user.click(requests);
    const print = screen.getByRole("button", { name: "Print" });
    expect(print.firstElementChild).toHaveClass("lucide-printer");
    await user.click(print);

    expect(onRequestsToggle).toHaveBeenCalledOnce();
    expect(onPrintOpen).toHaveBeenCalledOnce();
  });

  it("leaves Print off when the organization has printing turned off", () => {
    render(<Toolbar {...defaultProps} onRequestsToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Shift requests/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
  });

  it("keeps More tools, holding Print, for someone with editor tools", () => {
    render(
      <Toolbar
        {...defaultProps}
        onRequestsToggle={vi.fn()}
        onPrintOpen={vi.fn()}
        onPublishHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "More tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Shift requests/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
  });
});

describe("Toolbar — active state styles", () => {
  it("date label updates when spanWeeks changes", () => {
    const { rerender } = render(<Toolbar {...defaultProps} spanWeeks={1} />);
    // 1 week: shows M/D - M/D
    expect(screen.getByText(/\d{1,2}\/\d{1,2} - \d{1,2}\/\d{1,2}/)).toBeInTheDocument();
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
  it("clicking previous chevron calls onPrev", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Go to previous period" }));
    expect(defaultProps.onPrev).toHaveBeenCalledTimes(1);
  });

  it("clicking next chevron calls onNext", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Go to next period" }));
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

  it("hides the 2-week option when hideTwoWeek is true", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} hideTwoWeek />);
    await user.click(screen.getByRole("button", { name: "1 Week" }));
    expect(screen.queryByRole("option", { name: "2 Weeks" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1 Week" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Month" })).toBeInTheDocument();
  });

  it("shows the 2-week option when hideTwoWeek is false", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} hideTwoWeek={false} />);
    await user.click(screen.getByRole("button", { name: "1 Week" }));
    expect(screen.getByRole("option", { name: "2 Weeks" })).toBeInTheDocument();
  });
});

describe("Toolbar — staff search", () => {
  it("typing in search input calls onStaffSearchChange with typed value", async () => {
    const user = userEvent.setup();
    render(<Toolbar {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Search staff" }));
    const input = screen.getByPlaceholderText("Search staff");
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
  it("week label always matches M/D - M/D for spans 1 and 2", () => {
    // Validates: Requirements 2.9, 2.10, 8.1
    const arbDate = fc
      .date({ min: new Date(2000, 0, 1), max: new Date(2030, 11, 31) })
      .filter((d) => !isNaN(d.getTime()));
    const arbNumericSpan = fc.constantFrom(1 as const, 2 as const);

    fc.assert(
      fc.property(arbDate, arbNumericSpan, (date, span) => {
        const { unmount } = render(<Toolbar {...defaultProps} weekStart={date} spanWeeks={span} />);
        const label = screen.getByText(/\d{1,2}\/\d{1,2}/);
        const result = /^\d{1,2}\/\d{1,2} - \d{1,2}\/\d{1,2}$/.test(label.textContent ?? "");
        unmount();
        return result;
      }),
      { numRuns: 100 },
    );
  }, 15_000);

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
  }, 15_000);
});
