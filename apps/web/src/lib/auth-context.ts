"use client";

import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  signOut: () => Promise<void>;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Reactive browser auth state (the single source of truth, provided by
 * <AuthProvider>). Lives in lib rather than the components layer so feature
 * modules (e.g. features/permissions) can consume it without importing the UI
 * layer — and without spinning up a second auth subscription that would race
 * AuthProvider for the Web Locks API.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
