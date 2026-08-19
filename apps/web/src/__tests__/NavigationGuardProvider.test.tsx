import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationGuardProvider, useNavigationGuard } from "@/components/NavigationGuardProvider";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  usePathname: () => "/settings",
}));

/**
 * Stands in for whatever the click would have done. The real target is a Next
 * `<Link>`, whose own onClick is exactly what `stopPropagation` must suppress,
 * so recording a handler on the anchor is the closest jsdom equivalent of
 * "did the navigation happen".
 */
const navigate = vi.fn();

function GuardedPage({
  dirty,
  onDiscard,
  anchorProps = {},
  children,
}: {
  dirty: boolean;
  onDiscard?: () => void;
  anchorProps?: React.AnchorHTMLAttributes<HTMLAnchorElement>;
  children?: React.ReactNode;
}) {
  useNavigationGuard("test-page", { isDirty: () => dirty, onDiscard });

  return (
    <a
      href="/settings?section=jobs"
      onClick={(event) => {
        // A real Link navigates instead of following the href; preventing the
        // default here keeps jsdom from logging an unimplemented navigation.
        event.preventDefault();
        navigate();
      }}
      {...anchorProps}
    >
      {children ?? "Jobs"}
    </a>
  );
}

/** Same registration, but the link has left the DOM. */
function GuardWithoutLink() {
  useNavigationGuard("test-page", { isDirty: () => true });

  return null;
}

function renderGuarded(props: React.ComponentProps<typeof GuardedPage>) {
  return render(
    <NavigationGuardProvider>
      <GuardedPage {...props} />
    </NavigationGuardProvider>,
  );
}

const DIALOG_TITLE = "Unsaved changes";

beforeEach(() => {
  navigate.mockReset();
  routerPush.mockReset();
});

describe("NavigationGuardProvider", () => {
  it("lets a link through when nothing is dirty", async () => {
    renderGuarded({ dirty: false });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
  });

  it("lets a link through when no page has registered at all", async () => {
    // The provider wraps the whole app, so the overwhelmingly common case is an
    // empty registry. It has to be inert there.
    render(
      <NavigationGuardProvider>
        <a
          href="/settings?section=jobs"
          onClick={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          Jobs
        </a>
      </NavigationGuardProvider>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("asks before a link throws away unsaved work", async () => {
    renderGuarded({ dirty: true });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(screen.getByText(DIALOG_TITLE)).toBeInTheDocument();
    // stopPropagation is what keeps <Link>'s own handler from running.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates once the discard is confirmed", async () => {
    const onDiscard = vi.fn();
    renderGuarded({ dirty: true, onDiscard });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    // Replayed through the anchor itself, so a <Link replace> stays a replace.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
  });

  it("stays put, with the work intact, when the user keeps editing", async () => {
    const onDiscard = vi.fn();
    renderGuarded({ dirty: true, onDiscard });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
  });

  it("stops guarding once the page unmounts", async () => {
    const { rerender } = renderGuarded({ dirty: true });

    rerender(
      <NavigationGuardProvider>
        <a
          href="/settings?section=jobs"
          onClick={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          Jobs
        </a>
      </NavigationGuardProvider>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
  });

  describe("clicks it must never intercept", () => {
    // Each of these leaves the current page untouched, so blocking them would
    // break ordinary browser behaviour app-wide rather than protect anything.
    it.each([
      ["meta-click (new tab)", "{Meta>}"],
      ["ctrl-click (new tab)", "{Control>}"],
      ["shift-click (new window)", "{Shift>}"],
    ])("%s", async (_label, heldKey) => {
      renderGuarded({ dirty: true });

      const user = userEvent.setup();
      // `{Key>}` holds the modifier down, so the click below carries it.
      await user.keyboard(heldKey);
      await user.click(screen.getByRole("link", { name: "Jobs" }));

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("target=_blank", async () => {
      renderGuarded({ dirty: true, anchorProps: { target: "_blank" } });

      await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("a download link", async () => {
      renderGuarded({ dirty: true, anchorProps: { download: "" } });

      await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("an external origin", async () => {
      renderGuarded({ dirty: true, anchorProps: { href: "https://example.com/docs" } });

      await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("a mailto: link", async () => {
      renderGuarded({ dirty: true, anchorProps: { href: "mailto:support@dubgrid.com" } });

      await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("a non-primary button", () => {
      renderGuarded({ dirty: true });

      // Fired directly rather than through userEvent: a real middle-click
      // dispatches `auxclick`, which never reaches a `click` listener at all,
      // so driving it that way would pass without touching the guard. The
      // button check is the belt to that braces — this exercises it.
      fireEvent.click(screen.getByRole("link", { name: "Jobs" }), { button: 1 });

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
    });

    it("alt-click (download in some browsers)", async () => {
      renderGuarded({ dirty: true });

      const user = userEvent.setup();
      await user.keyboard("{Alt>}");
      await user.click(screen.getByRole("link", { name: "Jobs" }));

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("a click something upstream already handled", async () => {
      // Window capture runs ahead of document capture, so this is reachable —
      // and a click already claimed by someone else is not ours to re-ask about.
      const upstream = (event: MouseEvent) => event.preventDefault();
      window.addEventListener("click", upstream, { capture: true });

      try {
        renderGuarded({ dirty: true });
        await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

        expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
      } finally {
        window.removeEventListener("click", upstream, { capture: true });
      }
    });

    it("an SVG anchor, which has no string href", async () => {
      render(
        <NavigationGuardProvider>
          <GuardedPage dirty />
          <svg>
            <a href="/settings?section=jobs">
              <text>Icon link</text>
            </a>
          </svg>
        </NavigationGuardProvider>,
      );

      await userEvent.click(screen.getByText("Icon link"));

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
    });

    it("an in-page #hash link", async () => {
      renderGuarded({
        dirty: true,
        anchorProps: { href: `${window.location.pathname}#section-two` },
      });

      await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

      expect(screen.queryByText(DIALOG_TITLE)).not.toBeInTheDocument();
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });

  it("still guards a link that spells out target=_self", async () => {
    // The counterpart to the target=_blank case: only a target that leaves this
    // tab is exempt, and an explicit _self must not slip through with it.
    renderGuarded({ dirty: true, anchorProps: { target: "_self" } });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(screen.getByText(DIALOG_TITLE)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to the router when the link is gone by the time it is confirmed", async () => {
    const { rerender } = renderGuarded({ dirty: true });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));
    expect(screen.getByText(DIALOG_TITLE)).toBeInTheDocument();

    // The page re-rendered the link away while the dialog was up, so there is
    // no longer an anchor to replay the click through.
    rerender(
      <NavigationGuardProvider>
        <GuardWithoutLink />
      </NavigationGuardProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    // Reconstructed rather than replayed — the one path where a <Link replace>
    // would degrade to a push, which is why it is the fallback and not the rule.
    expect(routerPush).toHaveBeenCalledWith(`${window.location.origin}/settings?section=jobs`);
    expect(navigate).not.toHaveBeenCalled();
  });

  describe("tab close and refresh", () => {
    function fireBeforeUnload() {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }

    it("warns while there is unsaved work", () => {
      renderGuarded({ dirty: true });

      expect(fireBeforeUnload()).toBe(true);
    });

    it("stays quiet when there is nothing to lose", () => {
      renderGuarded({ dirty: false });

      expect(fireBeforeUnload()).toBe(false);
    });
  });
});
