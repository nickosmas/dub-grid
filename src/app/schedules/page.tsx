import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Schedules | DubGrid",
};

export default function SchedulesAliasPage() {
  redirect("/schedule");
}
