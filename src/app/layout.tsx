import type { Metadata } from "next";
import { DM_Sans, DM_Mono, Geist } from "next/font/google";
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
  icons: {
    icon: [
      {
        url: "/icon/light",
        type: "image/png",
        sizes: "32x32",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon/dark",
        type: "image/png",
        sizes: "32x32",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
  openGraph: {
    title: "DubGrid",
    description: "Smart staff scheduling for care facilities",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DubGrid",
    description: "Smart staff scheduling for care facilities",
  },
};



import AuthProvider from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";
import { MobileSubNavProvider } from "@/components/MobileSubNavContext";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(dmSans.variable, dmMono.variable, "font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <AuthProvider>
          <MobileSubNavProvider>
            <AppShell>{children}</AppShell>
          </MobileSubNavProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
