import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export async function handleApiError(error: unknown) {
    if (error instanceof Error) {
        if (error.message.includes("jwt expired") || error.message.includes("Refresh Token Not Found")) {
            toast.error("Your session has expired. Please log in again.", { duration: 5000 });
            await supabase.auth.signOut({ scope: "local" });
            window.location.replace("/");
            return;
        }

        if (error.message.includes("Failed to fetch") || error.name === "TypeError") {
            toast.error(
                "We're having trouble connecting. If you are using an adblocker or privacy shield, please try pausing it.",
                { duration: 8000 }
            );
            return;
        }

        console.error("handleApiError:", error.message);
        toast.error("Something went wrong. Please try again.");
    } else {
        toast.error("An unknown error occurred.");
    }
}
