import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonRecordCard } from "./PersonRecordCard";
import { makeEmployee } from "@/__tests__/factories";

// Noon UTC, so the local calendar day is the same in every test zone.
const ADDED = "2026-01-09T12:00:00.000Z";
const JOINED = "2026-02-03T12:00:00.000Z";
const CHANGED = "2026-04-10T12:00:00.000Z";

function day(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fieldValue(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe("PersonRecordCard", () => {
  it("shows every record fact for a linked person", () => {
    render(
      <PersonRecordCard
        employee={makeEmployee({
          createdAt: ADDED,
          joinedAt: JOINED,
          status: "inactive",
          statusChangedAt: CHANGED,
          statusNote: "On leave until May",
          userId: "user-1",
        })}
        accountState={{ kind: "linked" }}
        lastSignInAt="2026-09-20T08:00:00.000Z"
      />,
    );

    expect(fieldValue("Date added")).toBe(day(ADDED));
    expect(fieldValue("Date joined")).toBe(day(JOINED));
    expect(fieldValue("Status")).toBe("Inactive");
    expect(fieldValue("Status changed")).toBe(day(CHANGED));
    expect(fieldValue("Status note")).toBe("On leave until May");
    expect(fieldValue("Account")).toBe("Linked account");
    expect(screen.getByText("Last active")).toBeInTheDocument();
  });

  it("says plainly when an unlinked person has not joined or been invited", () => {
    render(
      <PersonRecordCard
        employee={makeEmployee({ createdAt: null, joinedAt: null, statusChangedAt: null })}
        accountState={{ kind: "not-invited" }}
      />,
    );

    expect(fieldValue("Date added")).toBe("Not recorded");
    expect(fieldValue("Date joined")).toBe("Not joined");
    expect(fieldValue("Status changed")).toBe("Not recorded");
    expect(fieldValue("Account")).toBe("Not invited");
    expect(screen.queryByText("Status note")).not.toBeInTheDocument();
  });

  it("names each invitation state and a missing address", () => {
    const invitation = {
      invitationId: "inv-1",
      email: "ada@example.com",
      sentAt: ADDED,
      expiresAt: JOINED,
    };
    const { rerender } = render(
      <PersonRecordCard
        employee={makeEmployee()}
        accountState={{ kind: "pending", ...invitation }}
      />,
    );
    expect(fieldValue("Account")).toBe("Invitation pending");

    rerender(
      <PersonRecordCard
        employee={makeEmployee()}
        accountState={{ kind: "expired", ...invitation }}
      />,
    );
    expect(fieldValue("Account")).toBe("Invitation expired");

    rerender(<PersonRecordCard employee={makeEmployee()} accountState={{ kind: "no-email" }} />);
    expect(fieldValue("Account")).toBe("No email");
  });

  it("leaves out last active when the viewer is not given sign-in activity", () => {
    render(
      <PersonRecordCard
        employee={makeEmployee()}
        accountState={{ kind: "linked" }}
        lastSignInAt={null}
      />,
    );

    expect(screen.queryByText("Last active")).not.toBeInTheDocument();
  });

  it("leaves out the joined date when it was not loaded, unlike one never set", () => {
    const { rerender } = render(
      <PersonRecordCard
        employee={makeEmployee({ joinedAt: undefined })}
        accountState={{ kind: "linked" }}
      />,
    );
    expect(screen.queryByText("Date joined")).not.toBeInTheDocument();

    rerender(
      <PersonRecordCard
        employee={makeEmployee({ joinedAt: null })}
        accountState={{ kind: "linked" }}
      />,
    );
    expect(fieldValue("Date joined")).toBe("Not joined");
  });
});
