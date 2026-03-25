import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

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

export async function handleApiError(error: unknown) {
    const message = extractErrorMessage(error, "");

    if (message.includes("jwt expired") || message.includes("Refresh Token Not Found") || message.includes("Invalid Refresh Token")) {
        toast.error("Your session has expired. Please log in again.", { duration: 5000 });
        await supabase.auth.signOut({ scope: "local" });
        window.location.replace("/");
        return;
    }

    if (message.includes("Failed to fetch") || (error instanceof Error && error.name === "TypeError")) {
        toast.error(
            "We're having trouble connecting. If you are using an adblocker or privacy shield, please try pausing it.",
            { duration: 8000 }
        );
        return;
    }

    if (message) {
        console.error("handleApiError:", message);
    }
    toast.error("Something went wrong. Please try again.");
}
