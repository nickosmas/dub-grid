import { toast } from "sonner";
import { signOutFromBrowser } from "@/features/account/client";

/** Extract a human-readable message from an unknown error value. */
export function extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (err && typeof err === "object" && "message" in err) {
        const msg = (err as { message: unknown }).message;
        if (typeof msg === "string") return msg;
    }
    if (typeof err === "string") return err;
    return fallback;
}

/**
 * Handle an API / async error with a contextual toast message.
 * @param error   The caught error value
 * @param action  Optional verb phrase describing what failed (e.g. "delete shift", "save profile")
 */
export async function handleApiError(error: unknown, action?: string) {
    const message = extractErrorMessage(error, "");

    if (message.includes("jwt expired") || message.includes("Refresh Token Not Found") || message.includes("Invalid Refresh Token")) {
        toast.error("Your session has expired. Please log in again.", { id: "session-expired", duration: Infinity });
        await signOutFromBrowser("local");
        window.location.replace("/");
        return;
    }

    if (message.includes("Failed to fetch") || (error instanceof Error && error.name === "TypeError")) {
        toast.error(
            "We're having trouble connecting. If you are using an adblocker or privacy shield, please try pausing it.",
            { id: "network-error", duration: 8000 }
        );
        return;
    }

    if (message) {
        console.error("handleApiError:", message);
    }

    const prefix = action ? `Failed to ${action}` : "Something went wrong";
    const detail = message && !message.includes("PGRST") && message.length < 120
        ? `: ${message}`
        : ". Please try again.";
    toast.error(`${prefix}${detail}`, { id: action ? `error-${action.replace(/\s+/g, "-")}` : "generic-error" });
}
