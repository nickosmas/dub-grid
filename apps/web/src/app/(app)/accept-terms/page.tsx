"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageShell } from "@/components/auth/AuthCard";
import TermsAcceptanceCard from "@/components/auth/TermsAcceptanceCard";
import { useAuth } from "@/components/AuthProvider";
import { useTermsAcceptanceStatus } from "@/hooks";
import { queryKeys } from "@/lib/query-keys";
import { CURRENT_TERMS_VERSION } from "@/features/account/shared/terms";
import { recordCurrentTermsAcceptance, signOutFromBrowser } from "@/features/account/client";

// Default next destination if none provided. Matches the login form's default.
const DEFAULT_NEXT = "/dashboard";

// Only allow internal navigations (open redirect defense).
function safeNext(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_NEXT;
  return raw;
}

export default function AcceptTermsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { data: terms, isLoading: termsLoading } = useTermsAcceptanceStatus();

  const next = safeNext(searchParams.get("next"));

  // Redirect unauth users to /login (preserving `next`).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/accept-terms?next=${next}`)}`);
    }
  }, [authLoading, user, next, router]);

  // If terms are already accepted, jump straight to next — never flash the card.
  useEffect(() => {
    if (!termsLoading && terms?.acceptedCurrentTerms) {
      router.replace(next);
    }
  }, [termsLoading, terms, next, router]);

  const accept = useMutation({
    mutationFn: recordCurrentTermsAcceptance,
    onSuccess: () => {
      if (user) {
        queryClient.setQueryData(queryKeys.account.terms(user.id), {
          acceptedCurrentTerms: true,
          acceptedVersion: CURRENT_TERMS_VERSION,
        });
      }
      router.replace(next);
    },
    onError: async (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);
      console.error("Terms acceptance failed:", msg, err);
      const isStaleSession =
        msg.includes("JWT") ||
        msg.includes("expired") ||
        msg.includes("foreign key") ||
        msg.includes("not found");
      if (isStaleSession) {
        toast.error("Your session expired. Sign in again.");
        await signOutFromBrowser("local");
        window.location.href = "/login";
        return;
      }
      toast.error("We couldn't record that. Try again.");
    },
  });

  function handleAccept() {
    if (!user) {
      toast.error("Your session expired. Sign in again.");
      return;
    }
    accept.mutate();
  }

  // Render a quiet shell while we figure out the auth/terms situation, the
  // redirect to next, or the redirect to /login. Avoids a flash of the card
  // for users who don't actually need to accept.
  const showCard =
    !authLoading &&
    !!user &&
    !termsLoading &&
    terms !== undefined &&
    terms.acceptedCurrentTerms === false;

  if (!showCard) return null;

  return (
    <PageShell>
      <TermsAcceptanceCard onAccept={handleAccept} loading={accept.isPending} />
    </PageShell>
  );
}
