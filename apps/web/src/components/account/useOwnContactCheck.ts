"use client";

import { useEffect, useState } from "react";
import { checkOwnContact } from "@/features/account/client";

const CHECK_DELAY_MS = 400;
const NOT_TAKEN = { emailTaken: false, phoneTaken: false };

interface OwnContactDraft {
  orgId: string | null | undefined;
  /** The changed, valid email, or null when there's nothing to check. */
  email: string | null;
  /** The changed, valid phone number, or null when there's nothing to check. */
  phone: string | null;
}

/**
 * Whether a changed email or phone belongs to someone else, with `checking`
 * true until the current values have an answer. A failed check blocks nothing:
 * the save itself still refuses a real clash.
 */
export function useOwnContactCheck({ orgId, email, phone }: OwnContactDraft) {
  const [answer, setAnswer] = useState({ key: "", ...NOT_TAKEN });
  const key = email || phone ? JSON.stringify([orgId ?? null, email, phone]) : "";

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkOwnContact({ orgId: orgId ?? null, email, phone })
        .then((result) => {
          if (!cancelled) setAnswer({ key, ...result });
        })
        .catch((error) => {
          console.error("checkOwnContact failed", error);
          if (!cancelled) setAnswer({ key, ...NOT_TAKEN });
        });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, orgId, email, phone]);

  const answered = key === answer.key;
  return {
    checking: Boolean(key) && !answered,
    emailTaken: Boolean(key) && answered && answer.emailTaken,
    phoneTaken: Boolean(key) && answered && answer.phoneTaken,
  };
}
