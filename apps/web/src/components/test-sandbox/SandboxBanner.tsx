"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  getOrganizationBootstrapQueryPolicy,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/Button";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { BrandLoadingScreen } from "@/components/BrandLoadingScreen";
import { Banner } from "@/components/ui/Banner";
import { FlaskConical } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { setUserViewActive } from "@/hooks";
import { SANDBOX_ENDED_NOTICE_COOKIE } from "@/lib/sandbox-cookie";

/**
 * True once, when the server just ended this tab's sandbox from elsewhere
 * (another window started one, a new sign-in, the cleanup job) and left its
 * short-lived note. Reading it removes it, so the notice is never repeated.
 */
function takeSandboxEndedNotice(): boolean {
  if (typeof document === "undefined") return false;
  const present = document.cookie
    .split(/;\s*/)
    .some((part) => part.startsWith(`${SANDBOX_ENDED_NOTICE_COOKIE}=`));
  if (present) {
    document.cookie = `${SANDBOX_ENDED_NOTICE_COOKIE}=; path=/; max-age=0`;
  }
  return present;
}

/**
 * Rendered by AppShell above the header, not inside it: the header is withheld
 * while a billing or setup lock is loading or applies, and a banner that
 * shares its fate left a sandboxed person with no sign they were in one and no
 * way out.
 */
export default function SandboxBanner() {
  const { user } = useAuth();
  const bootstrapQuery = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(),
    ...getOrganizationBootstrapQueryPolicy(),
    enabled: Boolean(user),
  });
  const [pendingAction, setPendingAction] = useState<"exit" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Without this the person was simply back in their organization with no word
  // on where the sandbox went. User view goes too: it was switched on inside a
  // sandbox that no longer exists.
  useEffect(() => {
    if (!takeSandboxEndedNotice()) return;
    setUserViewActive(false);
    toast.info("Your test sandbox has ended, so you're back in your organization.", {
      description:
        "This happens when you start a sandbox or sign in somewhere else. Its changes were discarded.",
    });
  }, []);

  const org = bootstrapQuery.data?.org ?? null;
  if (!org || org.workspaceKind !== "sandbox") return null;

  async function postSandboxAction(action: "exit" | "reset", errorFallback: string) {
    setPendingAction(action);
    setError(null);
    try {
      const response = await fetch("/api/test-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        // An error page from the platform (a 502, say) is not JSON; that is
        // still a failed action, not an unreachable server.
        const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        setError(formatClientErrorMessage(body?.error, errorFallback));
        setPendingAction(null);
        return;
      }
      // Hard-reload on exit and reset.
      //
      // We tried two softer approaches first — queryClient.invalidate
      // alone, then queryClient.clear() + invalidate + an AppShell
      // keyed remount — and both still left stale values in components
      // whose state lives outside React Query (settings forms that
      // hydrate local useState from props on mount, custom-labels-style
      // forms that snapshot data into local refs, context providers
      // that cache lookups, etc.). Forcing a same-page reload is the
      // only way to guarantee every component's local state is reset
      // when the active org id changes, without trying to enumerate
      // every form's hydration pattern.
      //
      // Same-page reload, not a navigation — the URL stays put, so
      // this doesn't feel like a logout. The cookie was cleared
      // (exit) or rewritten (reset) by the server response, so the
      // reloaded page sees the new sandbox state on its first
      // bootstrap fetch.
      // User view is a per-tab flag that survives the reload. Leaving or
      // restarting the sandbox should not drop the person into their real
      // organization still previewing it as a regular user.
      setUserViewActive(false);
      window.location.reload();
    } catch {
      setError("We couldn't reach the server. Try again in a moment.");
      setPendingAction(null);
    }
  }

  const handleExit = () => postSandboxAction("exit", "We couldn't exit sandbox mode right now.");
  const handleReset = () => postSandboxAction("reset", "We couldn't reset the sandbox right now.");

  return (
    <>
      {pendingAction ? (
        <BrandLoadingScreen
          animation="climb"
          revealAfterMs={0}
          label={pendingAction === "exit" ? "Leaving sandbox" : "Resetting sandbox"}
        />
      ) : null}
      <Banner
        tone="danger"
        layout="bar"
        icon={FlaskConical}
        role="status"
        aria-label="You're in sandbox mode"
        className="flex-wrap"
        action={
          <div className="flex items-center gap-2">
            {error ? <span>{error}</span> : null}
            <Button
              type="button"
              onClick={handleReset}
              disabled={pendingAction != null}
              className="dg-btn dg-btn-secondary dg-btn-sm"
              title="Discard all sandbox changes and start over with a fresh clone of your organization."
            >
              <ButtonLoading loading={pendingAction === "reset"}>Reset sandbox</ButtonLoading>
            </Button>
            <Button
              type="button"
              onClick={handleExit}
              disabled={pendingAction != null}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              <ButtonLoading loading={pendingAction === "exit"}>Exit sandbox</ButtonLoading>
            </Button>
          </div>
        }
      >
        <span className="truncate">
          You&rsquo;re in sandbox mode. Changes here don&rsquo;t affect your organization.
        </span>
      </Banner>
    </>
  );
}
