import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "DubGrid",
  description: "Smart staff scheduling for care facilities",
  openGraph: {
    title: "DubGrid",
    description: "Smart staff scheduling for care facilities",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "DubGrid",
    description: "Smart staff scheduling for care facilities",
  },
};



import AuthProvider from "@/components/AuthProvider";
import { PageTransitionProvider } from "@/components/PageTransition";
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <AuthProvider>
          <PageTransitionProvider>{children}</PageTransitionProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
