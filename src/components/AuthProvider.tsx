"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Toaster } from "sonner";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Listen for auth state changes
    // Supabase JS auto-refreshes the token via a background timer.
    // If it fails (or user signs out), this fires with 'SIGNED_OUT'
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (event === "SIGNED_OUT" || !session) {
        const path = window.location.pathname;
        const isPublicRoute =
          path === "/" ||
          path === "/login" ||
          path.startsWith("/login") ||
          path === "/privacy" ||
          path === "/terms";
        if (!isPublicRoute) {
          window.location.replace("/");
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <Toaster position="top-center" richColors />
      {children}
    </>
  );
}
