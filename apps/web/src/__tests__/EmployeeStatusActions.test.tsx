import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  EmployeeStatusActions,
  StatusCardActions,
} from "@/components/staff-detail/EmployeeStatusActions";
import type { AbsenceType, Employee } from "@/types";

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** A local day `offset` days from today; tomorrow is the earliest return date offered. */
function dayFromToday(offset: number): { key: string; label: string } {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const key = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return { key, label: `Choose ${DAY_LABEL.format(date)}` };
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "alice@example.com",
    contactNotes: "",
    userId: "user-1",
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
    ...overrides,
  };
}

const ABSENCE_TYPES: AbsenceType[] = [
  {
    id: 134,
    orgId: "org-1",
    label: "V",
    name: "Vacation",
    color: "",
    border: "",
    text: "",
    sortOrder: 0,
  },
  {
    id: 135,
    orgId: "org-1",
    label: "S",
    name: "Sick",
    color: "",
    border: "",
    text: "",
    sortOrder: 1,
  },
];

function renderActions(employee: Employee, absenceTypes: AbsenceType[] = []) {
  const handlers = {
    onDeactivate: vi.fn(),
    onActivate: vi.fn(),
    onRemove: vi.fn(),
    onSetReturnDate: vi.fn(),
    onReinstate: vi.fn(),
    onSuspend: vi.fn(),
    onSetPlannedAway: vi.fn(),
  };
  render(
    <EmployeeStatusActions
      employee={employee}
      canEdit
      variant="page"
      absenceTypes={absenceTypes}
      {...handlers}
    />,
  );
  return handlers;
}

async function openDialog(
  user: ReturnType<typeof userEvent.setup>,
  title = "Change Alice Smith's status?",
) {
  await user.click(screen.getByRole("button", { name: "Change status" }));
  return screen.getByRole("dialog", { name: title });
}

function choices(dialog: HTMLElement) {
  return within(within(dialog).getByRole("radiogroup", { name: "Change to" }))
    .getAllByRole("radio")
    .map((radio) => radio.textContent);
}

describe("EmployeeStatusActions", () => {
  it("shows one Change status button for every status", () => {
    for (const overrides of [
      {},
      { status: "inactive" as const },
      { suspendedAt: "2026-10-26T12:00:00Z" },
      { status: "removed" as const, archivedAt: "2026-10-01T00:00:00Z" },
    ]) {
      const { unmount } = render(
        <EmployeeStatusActions
          employee={makeEmployee(overrides)}
          canEdit
          variant="page"
          onDeactivate={vi.fn()}
          onActivate={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
      expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Change status",
      ]);
      unmount();
    }
  });

  it("says where they stand under the title and lists only where they can go", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee());

    const dialog = await openDialog(user);

    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "ActiveCan sign in and be scheduled.",
    );
    expect(within(dialog).getByText("Change to")).toBeInTheDocument();
    expect(choices(dialog)).toEqual([
      "AwayKeeps sign-in. Not scheduled while away.",
      "SuspendedCan't sign in. Stays on the schedule.",
      "ArchivedOff staff. Can't sign in or be scheduled.",
    ]);
    // Nothing is picked yet, so there's nothing to confirm.
    expect(within(dialog).getByRole("button", { name: "Change status" })).toBeDisabled();
  });

  it("names the picked change in the title and keeps what stays apart from what changes", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee());

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Archived/ }));

    expect(dialog).toHaveAccessibleName("Archive Alice Smith?");
    const changes = within(dialog).getByRole("region", { name: "Changes" });
    expect(changes).toHaveTextContent("They can no longer sign in.");
    expect(within(dialog).getByRole("region", { name: "Stays the same" })).toHaveTextContent(
      "Past records stay, and you can restore them later.",
    );
  });

  it("marks someone away with a trimmed reason", async () => {
    const user = userEvent.setup();
    const { onDeactivate, onRemove } = renderActions(makeEmployee());

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Away/ }));
    expect(within(dialog).getByText(/can still sign in and keep their role/i)).toBeInTheDocument();
    await user.type(within(dialog).getByPlaceholderText(/Reason \(optional\)/), "  Family leave  ");
    await user.click(within(dialog).getByRole("button", { name: "Mark away" }));

    expect(onDeactivate).toHaveBeenCalledWith("emp-1", "Family leave");
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("marks someone away until a return date with an absence for those days", async () => {
    const user = userEvent.setup();
    const { onDeactivate } = renderActions(makeEmployee(), ABSENCE_TYPES);
    const day = dayFromToday(1);

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Away/ }));
    // The absence is there from the start, waiting for a return date to fill up to.
    expect(within(dialog).getByRole("button", { name: "Absence" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      within(dialog).getByText("Set a return date to fill their days with an absence."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Return date" }));
    await user.click(screen.getByRole("button", { name: day.label }));
    await user.click(within(dialog).getByRole("button", { name: "Absence" }));
    await user.click(screen.getByRole("option", { name: "Vacation" }));

    expect(
      within(dialog).getByText(/^Every day until .* shows Vacation in the draft/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Mark away" }));
    expect(onDeactivate).toHaveBeenCalledWith("emp-1", undefined, day.key, 134);
  });

  it("archives someone with a trimmed reason", async () => {
    const user = userEvent.setup();
    const { onRemove } = renderActions(makeEmployee({ userId: "user-1" }));

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Archived/ }));
    await user.type(within(dialog).getByPlaceholderText(/Reason \(optional\)/), " Left ");
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    expect(onRemove).toHaveBeenCalledWith("emp-1", "Left");
  });

  it("suspends someone, saying what that does", async () => {
    const user = userEvent.setup();
    const { onSuspend } = renderActions(makeEmployee());

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Suspended/ }));
    expect(
      within(dialog).getByText("They're signed out on every device and can't sign in."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));

    expect(onSuspend).toHaveBeenCalledWith("emp-1");
  });

  it("offers a management-only person no Away", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee({ focusAreaIds: [] }));

    const dialog = await openDialog(user);

    expect(within(dialog).queryByRole("radio", { name: /^Away/ })).not.toBeInTheDocument();
  });

  it("reinstates a suspended person", async () => {
    const user = userEvent.setup();
    const { onReinstate } = renderActions(makeEmployee({ suspendedAt: "2026-10-26T12:00:00Z" }));

    const dialog = await openDialog(user);
    expect(within(dialog).getByText("Suspended since Oct 26")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: /^Active/ }));
    await user.click(within(dialog).getByRole("button", { name: "Reinstate" }));

    expect(onReinstate).toHaveBeenCalledWith("emp-1");
  });

  it("brings an Away person back with Mark active", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderActions(makeEmployee({ status: "inactive" }));

    const dialog = await openDialog(user);
    expect(choices(dialog)).toHaveLength(2);
    await user.click(within(dialog).getByRole("radio", { name: /^Active/ }));
    await user.click(within(dialog).getByRole("button", { name: "Mark active" }));

    expect(onActivate).toHaveBeenCalledWith("emp-1");
  });

  it("changes an Away person's return date with nothing picked, as Save changes", async () => {
    const user = userEvent.setup();
    const { onSetReturnDate, onActivate } = renderActions(
      makeEmployee({ status: "inactive", awayUntil: dayFromToday(1).key }),
    );
    const day = dayFromToday(2);

    const dialog = await openDialog(user);
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Return date" }));
    await user.click(screen.getByRole("button", { name: day.label }));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(onSetReturnDate).toHaveBeenCalledWith("emp-1", day.key, null);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("changes only the absence on an Away person's days", async () => {
    const user = userEvent.setup();
    const { onSetReturnDate } = renderActions(
      makeEmployee({ status: "inactive", awayUntil: "2099-01-05", awayAbsenceTypeId: 134 }),
      ABSENCE_TYPES,
    );

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Absence" }));
    await user.click(screen.getByRole("option", { name: "Sick" }));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(onSetReturnDate).toHaveBeenCalledWith("emp-1", "2099-01-05", 135);
  });

  it("restores an archived person", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderActions(
      makeEmployee({ status: "removed", archivedAt: "2026-10-01T00:00:00Z" }),
    );

    // Restore is the only way on, so there is nothing to pick: the dialog says what it does.
    const dialog = await openDialog(user, "Restore Alice Smith?");
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "They'll be Active again: back on staff, and they can sign in and be scheduled.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));

    expect(onActivate).toHaveBeenCalledWith("emp-1");
  });

  it("schedules an Away for a later start, keeping them Active until then", async () => {
    const user = userEvent.setup();
    const { onDeactivate } = renderActions(makeEmployee());
    const start = dayFromToday(1);
    const back = dayFromToday(2);

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Away/ }));
    await user.click(within(dialog).getByRole("button", { name: "Starts" }));
    await user.click(screen.getByRole("button", { name: start.label }));
    await user.click(within(dialog).getByRole("button", { name: "Return date" }));
    await user.click(screen.getByRole("button", { name: back.label }));

    expect(within(dialog).getByText(/^They stay Active until /)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Schedule away" }));
    expect(onDeactivate).toHaveBeenCalledWith("emp-1", undefined, back.key, null, start.key);
  });

  const planned = {
    plannedStatus: "away" as const,
    plannedFrom: "2099-01-05",
    plannedUntil: "2099-01-12",
    plannedAbsenceTypeId: 134,
  };

  it("shows a planned Away under the status and saves a changed absence", async () => {
    const user = userEvent.setup();
    const { onSetPlannedAway } = renderActions(makeEmployee(planned), ABSENCE_TYPES);

    const dialog = await openDialog(user);
    expect(within(dialog).getByText("Planned: Away from Mon, Jan 5")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Back Mon, Jan 12. Vacation on those days."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Absence" }));
    await user.click(screen.getByRole("option", { name: "Sick" }));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(onSetPlannedAway).toHaveBeenCalledWith("emp-1", {
      startDate: "2099-01-05",
      returnDate: "2099-01-12",
      absenceTypeId: 135,
    });
  });

  it("cancels a planned Away", async () => {
    const user = userEvent.setup();
    const { onSetPlannedAway } = renderActions(makeEmployee(planned), ABSENCE_TYPES);

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel planned away" }));
    expect(
      within(dialog).getByText("Those days go back to what was published, without Vacation."),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getAllByRole("button", { name: "Cancel planned away" }).at(-1) as HTMLElement,
    );

    expect(onSetPlannedAway).toHaveBeenCalledWith("emp-1", null);
  });

  it("says suspending someone cancels their planned Away", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee(planned));

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Suspended/ }));

    expect(
      within(dialog).getByText("The away planned from Jan 5 is cancelled."),
    ).toBeInTheDocument();
  });

  it("offers no second Away to someone with an away planned", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee(planned));

    const dialog = await openDialog(user);
    expect(choices(dialog)).toEqual([
      "SuspendedCan't sign in. Stays on the schedule.",
      "ArchivedOff staff. Can't sign in or be scheduled.",
    ]);
  });

  it("starts a planned away today when its start date is cleared", async () => {
    const user = userEvent.setup();
    const { onDeactivate, onSetPlannedAway } = renderActions(makeEmployee(planned), ABSENCE_TYPES);

    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText("Clear it to start their time away today."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Starts" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(dialog).toHaveAccessibleName("Mark Alice Smith away?");
    await user.click(within(dialog).getByRole("button", { name: "Mark away" }));
    expect(onDeactivate).toHaveBeenCalledWith("emp-1", undefined, "2099-01-12", 134);
    expect(onSetPlannedAway).not.toHaveBeenCalled();
  });

  it("keeps Edit plan to the plan and Change status to the list", async () => {
    const user = userEvent.setup();
    const base = {
      employee: makeEmployee(planned),
      canEdit: true,
      variant: "card" as const,
      onDeactivate: vi.fn(),
      onActivate: vi.fn(),
      onRemove: vi.fn(),
      onSuspend: vi.fn(),
      onSetPlannedAway: vi.fn(),
    };
    const { unmount } = render(<EmployeeStatusActions {...base} label="Edit plan" focus="plan" />);
    await user.click(screen.getByRole("button", { name: "Edit plan" }));
    let dialog = screen.getByRole("dialog", { name: "Change Alice Smith's planned away?" });
    expect(within(dialog).getByRole("button", { name: "Starts" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    unmount();

    render(<EmployeeStatusActions {...base} focus="status" />);
    dialog = await openDialog(user);
    expect(within(dialog).queryByRole("button", { name: "Starts" })).not.toBeInTheDocument();
    expect(choices(dialog)).toHaveLength(2);
  });

  const cardButtons = () =>
    screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);

  it("offers Reinstate first on a suspended person's card, with the rest in a menu", async () => {
    const user = userEvent.setup();
    const handlers = {
      onDeactivate: vi.fn(),
      onActivate: vi.fn(),
      onRemove: vi.fn(),
      onReinstate: vi.fn(),
      onSuspend: vi.fn(),
    };
    render(
      <StatusCardActions
        employee={makeEmployee({ suspendedAt: "2026-10-26T12:00:00Z" })}
        canEdit
        {...handlers}
      />,
    );

    expect(cardButtons()).toEqual(["Reinstate", "More status changes"]);
    await user.click(screen.getByRole("button", { name: "Reinstate" }));
    // Its own confirmation: no list, a sentence saying what it does.
    const dialog = screen.getByRole("dialog", { name: "Reinstate Alice Smith?" });
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "They'll be Active again and can sign in on the web and in the app.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reinstate" }));
    expect(handlers.onReinstate).toHaveBeenCalledWith("emp-1");
  });

  it("names each other change in the card's menu, and gives each its own confirmation", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <StatusCardActions
        employee={makeEmployee({ suspendedAt: "2026-10-26T12:00:00Z" })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={onRemove}
        onReinstate={vi.fn()}
        onSuspend={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More status changes" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Mark away",
      "Archive",
    ]);
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    const dialog = screen.getByRole("dialog", { name: "Archive Alice Smith?" });
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));
    expect(onRemove).toHaveBeenCalledWith("emp-1", undefined);
  });

  it("puts an Away person's return date in the menu, on its own", async () => {
    const user = userEvent.setup();
    render(
      <StatusCardActions
        employee={makeEmployee({ status: "inactive", awayUntil: dayFromToday(3).key })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        onSetReturnDate={vi.fn()}
      />,
    );

    expect(cardButtons()).toEqual(["Mark active", "More status changes"]);
    await user.click(screen.getByRole("button", { name: "More status changes" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Change return date",
      "Archive",
    ]);
    await user.click(screen.getByRole("menuitem", { name: "Change return date" }));
    const dialog = screen.getByRole("dialog", { name: "Change Alice Smith's return date?" });
    expect(within(dialog).getByRole("button", { name: "Return date" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("gives an archived person's card Restore alone, and an Active one Change status", () => {
    const base = { onDeactivate: vi.fn(), onActivate: vi.fn(), onRemove: vi.fn() };
    const { unmount } = render(
      <StatusCardActions
        employee={makeEmployee({ status: "removed", archivedAt: "2026-10-01T00:00:00Z" })}
        canEdit
        {...base}
      />,
    );
    expect(cardButtons()).toEqual(["Restore"]);
    unmount();
    render(<StatusCardActions employee={makeEmployee()} canEdit {...base} />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Change status",
    ]);
  });

  it("offers someone with no account no Suspend, and says nothing of sign-in", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee({ userId: null }));

    const dialog = await openDialog(user);
    expect(choices(dialog)).toEqual([
      "AwayNot scheduled while away.",
      "ArchivedOff staff. Can't be scheduled.",
    ]);
    expect(within(dialog).getByRole("status")).toHaveTextContent("ActiveCan be scheduled.");
    await user.click(within(dialog).getByRole("radio", { name: /^Archived/ }));
    expect(dialog).not.toHaveTextContent(/sign in/i);
  });

  it("shows nothing for your own record or without permission", () => {
    const { container } = render(
      <EmployeeStatusActions
        employee={makeEmployee()}
        canEdit
        isSelf
        variant="page"
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();

    const { container: noPermission } = render(
      <EmployeeStatusActions
        employee={makeEmployee()}
        canEdit={false}
        variant="page"
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(noPermission).toBeEmptyDOMElement();
  });
});
