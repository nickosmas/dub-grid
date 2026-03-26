import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request Demo | DubGrid",
  description:
    "Request a demo of DubGrid — smart staff scheduling for care facilities.",
};

export default function RequestDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
