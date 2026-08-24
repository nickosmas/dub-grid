import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Updated Terms of Service | DubGrid",
};

// Authed route — must be dynamic so the nonce-based CSP from middleware works.
// See csp-nonce-routes-dynamic.test.ts.
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
