import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "People | DubGrid",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
