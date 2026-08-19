"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";

/**
 * Imperative handle a page-level editor exposes so navigating away can ask
 * before throwing its work out. Deliberately the same shape as
 * `WizardEditorHandle` in `components/onboarding/WizardModeContext`, which
 * solves the same registration problem for a different consumer.
 */
export interface NavigationGuardHandle {
  /** True when local state differs from what is persisted. */
  isDirty: () => boolean;
  /**
   * Optional cleanup when the user confirms leaving. Navigating unmounts the
   * component and takes its state with it, so most callers need nothing here —
   * it is for side effects that outlive the component (a held lock, presence).
   */
  onDiscard?: () => void;
}

interface NavigationGuardContextValue {
  register?: (id: string, handle: NavigationGuardHandle) => () => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({});

/**
 * Register a surface holding unsaved work. Pass a stable id and a fresh handle
 * every render — the handle is kept alive in a ref so registration runs once.
 *
 * This guards **in-app link clicks and tab close/refresh**. It deliberately
 * does not cover browser Back/Forward (that needs a history sentinel, which
 * corrupts the history stack when it goes wrong) or programmatic
 * `router.push()`. Neither absence is a bug; see the provider below.
 *
 * A modal guards its own dismissal with `useUnsavedChangesPrompt` +
 * `Modal.onRequestClose` instead. The two compose: a modal that also wants
 * refresh protection can use both.
 */
export function useNavigationGuard(
  id: string,
  handle: NavigationGuardHandle,
  enabled = true,
): void {
  const ctx = useContext(NavigationGuardContext);
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    if (!enabled || !ctx.register) return;
    return ctx.register(id, {
      isDirty: () => handleRef.current.isDirty(),
      onDiscard: () => handleRef.current.onDiscard?.(),
    });
  }, [ctx, enabled, id]);
}

/**
 * The anchor this click would navigate with, or null when the click is one we
 * must not touch.
 *
 * This list is the whole risk surface of the guard: a missing condition breaks
 * cmd-click-to-new-tab or file downloads app-wide, not just on dirty pages.
 * Every branch here has a test.
 */
function findGuardedAnchor(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented) return null;
  // Left button only, and no modifier — the modified ones all mean "somewhere
  // other than this tab", which never loses the work on this page.
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;

  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  // Not a cast: an SVG <a> also matches the selector and has no string `href`.
  if (!(anchor instanceof HTMLAnchorElement)) return null;

  if (anchor.hasAttribute("download")) return null;
  const linkTarget = anchor.getAttribute("target");
  if (linkTarget && linkTarget !== "_self") return null;

  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }

  // mailto:, tel: and friends hand off to another app rather than navigating.
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== window.location.origin) return null;

  // An in-page anchor: same document, only the hash moves.
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash !== window.location.hash
  ) {
    return null;
  }

  return anchor;
}

/**
 * Asks before in-app navigation throws away unsaved work.
 *
 * Next 16 ships no navigation blocker — `next/navigation` exports nothing of
 * the kind, and `<Link onNavigate>` would have to be threaded through every one
 * of the app's ~58 links, where any link added later silently misses the guard.
 * So this intercepts centrally instead: one capture-phase listener on
 * `document`, which runs ahead of React's root listener and can therefore stop
 * `<Link>`'s own onClick from ever firing.
 *
 * Known, deliberate gaps: browser Back/Forward and programmatic `router.push`
 * are not intercepted. Neither is reachable from a click on an anchor.
 */
export function NavigationGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const guardsRef = useRef<Map<string, NavigationGuardHandle>>(new Map());
  /** Set while we replay a click we previously blocked, so it passes through. */
  const bypassRef = useRef(false);
  const [pending, setPending] = useState<{ anchor: HTMLAnchorElement; href: string } | null>(null);

  const register = useCallback((id: string, handle: NavigationGuardHandle) => {
    guardsRef.current.set(id, handle);
    return () => {
      guardsRef.current.delete(id);
    };
  }, []);

  // Reads through refs, so this is stable and both listeners below register
  // exactly once rather than churning on every keystroke in a guarded form.
  const hasDirty = useCallback(() => {
    for (const handle of guardsRef.current.values()) {
      if (handle.isDirty()) return true;
    }
    return false;
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (bypassRef.current) return;
      // Nothing registered: the guard cannot fire at all, which is what keeps a
      // bug in the checks above from reaching pages with nothing to lose.
      if (guardsRef.current.size === 0) return;
      const anchor = findGuardedAnchor(event);
      if (!anchor) return;
      if (!hasDirty()) return;

      event.preventDefault();
      // Stops <Link>'s own onClick, which is the point of capturing here.
      event.stopPropagation();
      setPending({ anchor, href: anchor.href });
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [hasDirty]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirty()) return;
      event.preventDefault();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasDirty]);

  const keepEditing = useCallback(() => setPending(null), []);

  const discard = useCallback(() => {
    setPending(null);
    if (!pending) return;

    for (const handle of guardsRef.current.values()) {
      if (handle.isDirty()) handle.onDiscard?.();
    }

    // Replay the original click rather than rebuilding the navigation.
    // `<Link replace>` renders a plain `<a href>` and keeps `replace` in its
    // onClick, so resuming with `router.push(href)` would quietly turn the
    // settings sidebar's replaces into history pushes. Replaying keeps
    // `replace`, `scroll` and prefetch exactly as the link declared them.
    bypassRef.current = true;
    try {
      if (pending.anchor.isConnected) {
        pending.anchor.click();
      } else {
        router.push(pending.href);
      }
    } finally {
      bypassRef.current = false;
    }
  }, [pending, router]);

  const value = useMemo<NavigationGuardContextValue>(() => ({ register }), [register]);

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      {pending ? <UnsavedChangesDialog onKeepEditing={keepEditing} onDiscard={discard} /> : null}
    </NavigationGuardContext.Provider>
  );
}
