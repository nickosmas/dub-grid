import { useEffect, useState } from "react";
import { checkMobileOwnContact } from "../../../shared/lib/api";

const CHECK_DELAY_MS = 400;
const NOT_TAKEN = { emailTaken: false, phoneTaken: false };

/**
 * Whether a changed email or phone is already used in your organizations,
 * checked while you type, the way web's My profile does. `checking` is true
 * until the current values have an answer. A failed check blocks nothing: the
 * save itself still refuses a real clash.
 */
export function useOwnContactCheck({
  accessToken,
  email,
  phone,
}: {
  accessToken: string | null | undefined;
  /** The changed, valid email, or null when there's nothing to check. */
  email: string | null;
  /** The changed, valid phone number, or null when there's nothing to check. */
  phone: string | null;
}) {
  const [answer, setAnswer] = useState({ key: "", ...NOT_TAKEN });
  const key = accessToken && (email || phone) ? JSON.stringify([email, phone]) : "";

  useEffect(() => {
    if (!key || !accessToken) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      checkMobileOwnContact(
        accessToken,
        { email: email ?? undefined, phone: phone ?? undefined },
        controller.signal,
      ).then(
        (result) => {
          if (!controller.signal.aborted) setAnswer({ key, ...result });
        },
        () => {
          if (!controller.signal.aborted) setAnswer({ key, ...NOT_TAKEN });
        },
      );
    }, CHECK_DELAY_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, accessToken, email, phone]);

  const answered = key !== "" && key === answer.key;
  return {
    checking: key !== "" && !answered,
    emailTaken: answered && answer.emailTaken,
    phoneTaken: answered && answer.phoneTaken,
  };
}
