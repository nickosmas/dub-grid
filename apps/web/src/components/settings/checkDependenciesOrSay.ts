import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";

const FALLBACK = "We couldn't check what uses this. Try again.";

/**
 * Runs a delete's dependency check and says so when it fails, so Delete
 * never becomes a button that does nothing. Resolves null on failure.
 */
export async function checkDependenciesOrSay<T>(check: () => Promise<T>): Promise<T | null> {
  try {
    return await check();
  } catch (error) {
    Sentry.captureException(error);
    // A network failure's own message ("Failed to fetch") means nothing here.
    const message = error instanceof Error && !(error instanceof TypeError) ? error.message : "";
    toast.error(message || FALLBACK);
    return null;
  }
}
