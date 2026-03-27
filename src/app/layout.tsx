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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://dubgrid.com"),
  title: "DubGrid",
  description: "Smart staff scheduling for care facilities",
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
import { TooltipProvider } from "@/components/ui/tooltip";

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
            <TooltipProvider>
              <AppShell>{children}</AppShell>
            </TooltipProvider>
          </MobileSubNavProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
