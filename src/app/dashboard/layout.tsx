import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | DubGrid",
  description: "Organization dashboard overview",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
