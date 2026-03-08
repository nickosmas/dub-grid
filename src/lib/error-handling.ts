import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export async function handleApiError(error: unknown) {
    if (error instanceof Error) {
        if (error.message.includes("jwt expired")) {
            toast.error("Your session has expired. Please log in again.", { duration: 5000 });
            await supabase.auth.signOut();
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

        toast.error(`An error occurred: ${error.message}`);
    } else {
        toast.error("An unknown error occurred.");
    }
}
