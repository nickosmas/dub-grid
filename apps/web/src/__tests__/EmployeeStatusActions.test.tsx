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

function renderActions(
  employee: Employee,
  absenceTypes: AbsenceType[] = [],
  { canOffboard = true }: { canOffboard?: boolean } = {},
) {
  const handlers = {
    onDeactivate: vi.fn(),
    onActivate: vi.fn(),
    onRemove: vi.fn(),
    onSetReturnDate: vi.fn(),
    onReinstate: vi.fn(),
    onSuspend: vi.fn(),
    onSetSuspendedUntil: vi.fn(),
    onSetPlannedChange: vi.fn(),
  };
  render(
    <EmployeeStatusActions
      employee={employee}
      canEdit
      canOffboard={canOffboard}
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
      "OffboardedNo longer on staff. Can't sign in or be scheduled.",
    ]);
    // Nothing is picked yet, so there's nothing to confirm.
    expect(within(dialog).getByRole("button", { name: "Change status" })).toBeDisabled();
  });

  it("names the picked change in the title and keeps what stays apart from what changes", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee());

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Offboarded/ }));

    expect(dialog).toHaveAccessibleName("Offboard Alice Smith?");
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
    await user.click(within(dialog).getByRole("radio", { name: /^Offboarded/ }));
    await user.type(within(dialog).getByPlaceholderText(/Reason \(optional\)/), " Left ");
    await user.click(within(dialog).getByRole("button", { name: "Offboard" }));

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

    expect(onSuspend).toHaveBeenCalledWith("emp-1", { startDate: null, until: null });
  });

  it("suspends someone until an end date (51g3)", async () => {
    const user = userEvent.setup();
    const { onSuspend } = renderActions(makeEmployee());
    const end = dayFromToday(5);

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Suspended/ }));
    await user.click(within(dialog).getByRole("button", { name: "Ends" }));
    await user.click(screen.getByRole("button", { name: end.label }));

    expect(within(dialog).getByText(/^They get access back on \w{3}, /)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(onSuspend).toHaveBeenCalledWith("emp-1", { startDate: null, until: end.key });
  });

  it("schedules a suspension for a later start (51g3)", async () => {
    const user = userEvent.setup();
    const { onSuspend } = renderActions(makeEmployee());
    const start = dayFromToday(2);

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Suspended/ }));
    await user.click(within(dialog).getByRole("button", { name: "Starts" }));
    await user.click(screen.getByRole("button", { name: start.label }));

    expect(within(dialog).getByText(/^They keep their access until /)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Schedule suspension" }));
    expect(onSuspend).toHaveBeenCalledWith("emp-1", { startDate: start.key, until: null });
  });

  it("changes a suspended person's end date with nothing picked, as Save changes", async () => {
    const user = userEvent.setup();
    const { onSetSuspendedUntil } = renderActions(
      makeEmployee({ suspendedAt: "2026-10-26T12:00:00Z", suspendedUntil: "2099-01-12" }),
    );

    const dialog = await openDialog(user);
    expect(within(dialog).getByText("Suspended until Mon, Jan 12")).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Ends" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(
      within(dialog).getByText("They stay suspended until someone reinstates them."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(onSetSuspendedUntil).toHaveBeenCalledWith("emp-1", null);
  });

  const plannedSuspension = {
    plannedStatus: "suspended" as const,
    plannedFrom: "2099-01-05",
    plannedUntil: "2099-01-12",
  };

  it("edits and cancels a planned suspension, with Suspended disabled in the list", async () => {
    const user = userEvent.setup();
    const { onSetPlannedChange } = renderActions(makeEmployee(plannedSuspension));

    const dialog = await openDialog(user);
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Planned: Suspended from Mon, Jan 5Until Mon, Jan 12.",
    );
    expect(choices(dialog)).toContain(
      "SuspendedPlanned from Mon, Jan 5. Change it with Edit plan.",
    );
    expect(within(dialog).getByRole("radio", { name: /^Suspended/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel planned suspension" }));

    expect(dialog).toHaveAccessibleName("Cancel Alice Smith's planned suspension?");
    await user.click(
      within(dialog)
        .getAllByRole("button", { name: "Cancel planned suspension" })
        .at(-1) as HTMLElement,
    );
    expect(onSetPlannedChange).toHaveBeenCalledWith("emp-1", null);
  });

  it("suspends today when a planned suspension's start date is cleared", async () => {
    const user = userEvent.setup();
    const { onSuspend, onSetPlannedChange } = renderActions(makeEmployee(plannedSuspension));

    const dialog = await openDialog(user);
    expect(within(dialog).getByText("Clear it to suspend them today.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Starts" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(dialog).toHaveAccessibleName("Suspend Alice Smith?");
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(onSuspend).toHaveBeenCalledWith("emp-1", { until: "2099-01-12" });
    expect(onSetPlannedChange).not.toHaveBeenCalled();
  });

  it("lists Away disabled, with its reason, for a management-only person", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee({ focusAreaIds: [] }));

    const dialog = await openDialog(user);
    const away = within(dialog).getByRole("radio", { name: /^Away/ });

    expect(away).toHaveAttribute("aria-disabled", "true");
    expect(away).toHaveTextContent("Only someone on the schedule can be marked away.");
    await user.click(away);
    expect(away).toHaveAttribute("aria-checked", "false");
    expect(within(dialog).getByRole("button", { name: "Change status" })).toBeDisabled();
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
    expect(choices(dialog)).toEqual([
      "ActiveBack on the schedule from today.",
      "SuspendedOnly someone who is active can be suspended.",
      "OffboardedNo longer on staff. Can't sign in or be scheduled.",
    ]);
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

  it("lists Offboarded and Restore disabled for a Super Admin an Admin can't reach (51k)", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee(), [], { canOffboard: false });

    const dialog = await openDialog(user);
    const offboard = within(dialog).getByRole("radio", { name: /^Offboarded/ });
    expect(offboard).toHaveAttribute("aria-disabled", "true");
    expect(offboard).toHaveTextContent("Only a Super Admin can offboard a Super Admin.");
    expect(within(dialog).getByRole("radio", { name: /^Suspended/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("says offboarding puts a pickup they claimed back up (51k)", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee());

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Offboarded/ }));

    expect(dialog).toHaveTextContent(
      "Open requests they're part of are closed, and pickups they claimed go back up for others.",
    );
  });

  it("restores an archived person", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderActions(
      makeEmployee({ status: "removed", archivedAt: "2026-10-01T00:00:00Z" }),
    );

    // Restore is the only way on, but Change status still lists every status.
    const dialog = await openDialog(user);
    expect(choices(dialog)).toEqual([
      "ActiveBack on staff. Can sign in and be scheduled.",
      "AwayOnly someone on staff can be marked away.",
      "SuspendedOnly someone who is active can be suspended.",
    ]);
    await user.click(within(dialog).getByRole("radio", { name: /^Active/ }));
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
    const { onSetPlannedChange } = renderActions(makeEmployee(planned), ABSENCE_TYPES);

    const dialog = await openDialog(user);
    expect(within(dialog).getByText("Planned: Away from Mon, Jan 5")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Back Mon, Jan 12. Vacation on those days."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Absence" }));
    await user.click(screen.getByRole("option", { name: "Sick" }));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(onSetPlannedChange).toHaveBeenCalledWith("emp-1", {
      startDate: "2099-01-05",
      returnDate: "2099-01-12",
      absenceTypeId: 135,
    });
  });

  it("cancels a planned Away", async () => {
    const user = userEvent.setup();
    const { onSetPlannedChange } = renderActions(makeEmployee(planned), ABSENCE_TYPES);

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel planned away" }));
    expect(
      within(dialog).getByText("Those days go back to what was published, without Vacation."),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getAllByRole("button", { name: "Cancel planned away" }).at(-1) as HTMLElement,
    );

    expect(onSetPlannedChange).toHaveBeenCalledWith("emp-1", null);
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

  it("lists Away disabled, pointing at Edit plan, for someone with an away planned", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee(planned));

    const dialog = await openDialog(user);
    expect(choices(dialog)).toEqual([
      expect.stringMatching(/^AwayPlanned from \w{3}, \w{3} \d+\. Change it with Edit plan\.$/),
      "SuspendedCan't sign in. Stays on the schedule.",
      "OffboardedNo longer on staff. Can't sign in or be scheduled.",
    ]);
  });

  it("starts a planned away today when its start date is cleared", async () => {
    const user = userEvent.setup();
    const { onDeactivate, onSetPlannedChange } = renderActions(
      makeEmployee(planned),
      ABSENCE_TYPES,
    );

    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText("Clear it to start their time away today."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Starts" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(dialog).toHaveAccessibleName("Mark Alice Smith away?");
    await user.click(within(dialog).getByRole("button", { name: "Mark away" }));
    expect(onDeactivate).toHaveBeenCalledWith("emp-1", undefined, "2099-01-12", 134);
    expect(onSetPlannedChange).not.toHaveBeenCalled();
  });

  it("sets a last day through Offboard, and offboards now without one (51g2)", async () => {
    const user = userEvent.setup();
    const lastDay = dayFromToday(3);
    const { onRemove } = renderActions(makeEmployee());

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Offboarded/ }));
    expect(
      within(dialog).getByText(
        "They stay Active through this day and are offboarded the day after. Leave it empty to offboard them now.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Last day" }));
    await user.click(screen.getByRole("button", { name: lastDay.label }));

    expect(
      within(dialog).getByText(/^They stay Active through .*, their last day\.$/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Set last day" }));
    expect(onRemove).toHaveBeenCalledWith("emp-1", undefined, lastDay.key);
  });

  it("offers no last day to someone suspended", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee({ suspendedAt: "2026-10-26T12:00:00Z" }));

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Offboarded/ }));
    expect(within(dialog).queryByRole("button", { name: "Last day" })).not.toBeInTheDocument();
  });

  const leaving = { plannedStatus: "removed" as const, plannedFrom: "2099-01-09" };

  it("shows a last day under the status, with Offboard disabled in the list", async () => {
    const user = userEvent.setup();
    const { onSetPlannedChange } = renderActions(makeEmployee(leaving));

    const dialog = await openDialog(user);
    expect(within(dialog).getByText("Planned: Leaving Thu, Jan 8")).toBeInTheDocument();
    expect(within(dialog).getByText("Offboarded on Fri, Jan 9.")).toBeInTheDocument();
    expect(choices(dialog)).toEqual([
      "AwayKeeps sign-in. Not scheduled while away.",
      "SuspendedCan't sign in. Stays on the schedule.",
      "OffboardedLeaving Thu, Jan 8. Change it with Edit plan.",
    ]);
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(onSetPlannedChange).not.toHaveBeenCalled();
  });

  it("moves a last day", async () => {
    const user = userEvent.setup();
    const later = dayFromToday(6);
    const { onSetPlannedChange } = renderActions(
      makeEmployee({ plannedStatus: "removed", plannedFrom: dayFromToday(4).key }),
    );

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Last day" }));
    await user.click(screen.getByRole("button", { name: later.label }));

    expect(dialog).toHaveAccessibleName("Change Alice Smith's last day?");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(onSetPlannedChange).toHaveBeenCalledWith("emp-1", { lastDay: later.key });
  });

  it("cancels a last day, and offboards today when it is cleared", async () => {
    const user = userEvent.setup();
    const { onSetPlannedChange, onRemove } = renderActions(makeEmployee(leaving));

    let dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel last day" }));
    expect(
      within(dialog).getByText("They stay Active and can be scheduled after that day again."),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getAllByRole("button", { name: "Cancel last day" }).at(-1) as HTMLElement,
    );
    expect(onSetPlannedChange).toHaveBeenCalledWith("emp-1", null);

    dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Last day" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(dialog).toHaveAccessibleName("Offboard Alice Smith?");
    await user.click(within(dialog).getByRole("button", { name: "Offboard" }));
    expect(onRemove).toHaveBeenCalledWith("emp-1");
  });

  it("says marking someone away cancels their last day", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee(leaving));

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /^Away/ }));

    expect(
      within(dialog).getByText("The last day planned for Jan 8 is cancelled."),
    ).toBeInTheDocument();
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
      onSetPlannedChange: vi.fn(),
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
    expect(choices(dialog)).toHaveLength(3);
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
      "Offboard",
    ]);
    await user.click(screen.getByRole("menuitem", { name: "Offboard" }));
    const dialog = screen.getByRole("dialog", { name: "Offboard Alice Smith?" });
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Offboard" }));
    expect(onRemove).toHaveBeenCalledWith("emp-1", undefined);
  });

  it("puts a suspended person's end date in the card's menu, on its own (51g3)", async () => {
    const user = userEvent.setup();
    render(
      <StatusCardActions
        employee={makeEmployee({ suspendedAt: "2026-10-26T12:00:00Z" })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        onReinstate={vi.fn()}
        onSuspend={vi.fn()}
        onSetSuspendedUntil={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More status changes" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Set end date",
      "Mark away",
      "Offboard",
    ]);
    await user.click(screen.getByRole("menuitem", { name: "Set end date" }));
    const dialog = screen.getByRole("dialog", {
      name: "Change when Alice Smith's suspension ends?",
    });
    expect(within(dialog).getByRole("button", { name: "Ends" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
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
      "Offboard",
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

  it("lists Suspend disabled for someone with no account, and says nothing of sign-in", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee({ userId: null }));

    const dialog = await openDialog(user);
    expect(choices(dialog)).toEqual([
      "AwayNot scheduled while away.",
      "SuspendedOnly someone with an account can be suspended.",
      "OffboardedNo longer on staff. Can't be scheduled.",
    ]);
    expect(within(dialog).getByRole("status")).toHaveTextContent("ActiveCan be scheduled.");
    await user.click(within(dialog).getByRole("radio", { name: /^Offboarded/ }));
    expect(dialog).not.toHaveTextContent(/sign in/i);
  });

  it("lists every status for no account and an away planned, never jumping to one (prod bug)", async () => {
    const user = userEvent.setup();
    renderActions(makeEmployee({ userId: null, plannedStatus: "away", plannedFrom: "2026-11-01" }));

    const dialog = await openDialog(user);
    expect(choices(dialog)).toEqual([
      "AwayPlanned from Sun, Nov 1. Change it with Edit plan.",
      "SuspendedOnly someone with an account can be suspended.",
      "OffboardedNo longer on staff. Can't be scheduled.",
    ]);
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("aria-disabled")),
    ).toEqual(["true", "true", null]);
    // Nothing is picked for them, not even the one choice left.
    expect(within(dialog).getByRole("radio", { name: /^Offboarded/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("names the card's button for the one change left, and opens its confirmation", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <StatusCardActions
        employee={makeEmployee({ userId: null, plannedStatus: "away", plannedFrom: "2026-11-01" })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={onRemove}
        onReinstate={vi.fn()}
        onSuspend={vi.fn()}
      />,
    );

    expect(cardButtons()).toEqual(["Offboard"]);
    await user.click(screen.getByRole("button", { name: "Offboard" }));
    const dialog = screen.getByRole("dialog", { name: "Offboard Alice Smith?" });
    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Offboard" }));
    expect(onRemove).toHaveBeenCalledWith("emp-1", undefined);
  });

  it("keeps Change status, with the disabled rows, when two or more changes are left", async () => {
    const user = userEvent.setup();
    render(
      <StatusCardActions
        employee={makeEmployee({ userId: null })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        onReinstate={vi.fn()}
        onSuspend={vi.fn()}
      />,
    );

    expect(cardButtons()).toEqual(["Change status"]);
    const dialog = await openDialog(user);
    expect(within(dialog).getByRole("radio", { name: /^Suspended/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("shows no card button when no change is left", () => {
    const { container } = render(
      <StatusCardActions
        employee={makeEmployee({
          userId: null,
          focusAreaIds: [],
          plannedStatus: "removed",
          plannedFrom: "2099-01-09",
        })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        onSuspend={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
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
