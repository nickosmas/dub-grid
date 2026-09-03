import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PresenceAvatars from "@/components/PresenceAvatars";
import type { OnlineUser } from "@/hooks/useCellLocks";

const onlineUser = (overrides: Partial<OnlineUser> = {}): OnlineUser => ({
  editorSessionId: "session-other",
  userId: "user-2",
  userName: "Riley RN",
  editingCell: null,
  canLockCells: true,
  isSameUser: false,
  sessionCount: 1,
  ...overrides,
});

describe("PresenceAvatars", () => {
  it("counts and renders other people only", () => {
    render(
      <PresenceAvatars
        onlineUsers={[
          onlineUser({
            editorSessionId: "session-self",
            userId: "user-1",
            userName: "Alex Admin",
            isSameUser: true,
          }),
          onlineUser({ userName: '"Riley RN', editingCell: "emp-2_2026-04-12" }),
        ]}
      />,
    );

    const otherAvatar = screen.getByRole("img", { name: '"Riley RN' });

    expect(screen.getByRole("status")).toHaveTextContent("1 online");
    expect(screen.queryByRole("img", { name: "Me" })).not.toBeInTheDocument();
    expect(otherAvatar).toHaveTextContent("RR");

    fireEvent.mouseEnter(otherAvatar);
    expect(screen.getByText('"Riley RN')).toBeInTheDocument();
  });

  it("renders nothing when only the current account is supplied", () => {
    const { container } = render(
      <PresenceAvatars
        onlineUsers={[
          onlineUser({
            editorSessionId: "session-self",
            userId: "user-1",
            userName: "Alex Admin",
            isSameUser: true,
          }),
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  describe("roster card", () => {
    const roster = [
      onlineUser({
        editorSessionId: "s1",
        userId: "u1",
        userName: "Alex Admin",
        editingCell: "emp-1_2026-03-03",
      }),
      onlineUser({
        editorSessionId: "s2",
        userId: "u2",
        userName: "Riley RN",
        sessionCount: 2,
      }),
    ];

    const openRoster = () => {
      fireEvent.mouseEnter(screen.getByRole("button", { expanded: false }));
    };

    it("opens on hover and lists every online editor", () => {
      render(<PresenceAvatars onlineUsers={roster} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      openRoster();

      const card = screen.getByRole("dialog", { name: "Editors online" });
      expect(card).toHaveTextContent("Alex Admin");
      expect(card).toHaveTextContent("Riley RN");
      expect(card).toHaveTextContent("2 tabs or devices");
    });

    // Presence only flags a cell while an edit panel is open, so real editing
    // reads as viewing. The claim is omitted rather than shown wrong.
    it("makes no viewing or editing claim about anyone", () => {
      render(<PresenceAvatars onlineUsers={roster} />);
      openRoster();

      const card = screen.getByRole("dialog");
      expect(card).not.toHaveTextContent(/viewing/i);
      expect(card).not.toHaveTextContent(/editing/i);
    });

    it("opens on keyboard focus and closes on Escape", () => {
      render(<PresenceAvatars onlineUsers={roster} />);

      fireEvent.focus(screen.getByRole("button", { expanded: false }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows role and email once profiles are supplied", () => {
      render(
        <PresenceAvatars
          onlineUsers={roster}
          profiles={new Map([["u1", { orgRole: "Admin", email: "alex@example.com" }]])}
        />,
      );

      openRoster();
      expect(screen.getByRole("dialog")).toHaveTextContent("Admin · alex@example.com");
    });

    it("degrades to names only when profiles are missing", () => {
      render(
        <PresenceAvatars
          onlineUsers={[
            ...roster,
            onlineUser({ editorSessionId: "s3", userId: "u3", userName: "Sam Viewer" }),
          ]}
          profiles={new Map()}
        />,
      );

      openRoster();
      const card = screen.getByRole("dialog");
      expect(card).toHaveTextContent("Alex Admin");
      expect(card).toHaveTextContent("Sam Viewer");
      expect(card).not.toHaveTextContent("@");
    });

    it("requests profile detail only when the roster opens", () => {
      const onRosterOpen = vi.fn();
      render(<PresenceAvatars onlineUsers={roster} onRosterOpen={onRosterOpen} />);

      expect(onRosterOpen).not.toHaveBeenCalled();
      openRoster();
      expect(onRosterOpen).toHaveBeenCalledTimes(1);
    });
  });
});
