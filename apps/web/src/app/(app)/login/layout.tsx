import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | DubGrid",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
