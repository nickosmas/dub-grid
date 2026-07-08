import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | DubGrid",
  description: "Organization dashboard overview",
};

// F-4: render this authed route dynamically so the per-request CSP nonce set in
// middleware is stamped onto its scripts. A static prerender can't carry a nonce.
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
