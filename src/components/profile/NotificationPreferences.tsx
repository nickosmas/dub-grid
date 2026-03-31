"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { Bell, Mail } from "lucide-react";

interface CategoryPrefs {
  in_app: boolean;
  email: boolean;
}

interface AllPrefs {
  [category: string]: CategoryPrefs;
}

const DEFAULT_PREFS: AllPrefs = {
  schedule: { in_app: true, email: false },
  shift_requests: { in_app: true, email: false },
  system: { in_app: true, email: false },
};

const CATEGORY_LABELS: Record<string, string> = {
  schedule: "Schedule Changes",
  shift_requests: "Shift Requests",
  system: "System Notifications",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  schedule: "Shift changes, published schedules",
  shift_requests: "New, approved, or rejected shift requests",
  system: "Impersonation notices and system updates",
};

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      const { data } = await supabase
        .from("notification_preferences")
        .select("prefs")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!cancelled) {
        if (data?.prefs) {
          setPrefs({ ...DEFAULT_PREFS, ...(data.prefs as AllPrefs) });
        }
        setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: session.user.id,
          prefs,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;
      toast.success("Notification preferences saved.");
    } catch {
      toast.error("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(category: string, channel: "in_app" | "email") {
    setPrefs((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category]?.[channel],
      },
    }));
  }

  if (!loaded) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)" }}>
        Choose how you want to be notified for each category.
      </p>

      {/* Header row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 60px 60px",
        gap: 8,
        alignItems: "center",
        paddingBottom: 8,
        borderBottom: "1px solid var(--color-border-light)",
      }}>
        <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Category
        </span>
        <span style={{ textAlign: "center" }} title="In-App">
          <Bell size={14} style={{ color: "var(--color-text-muted)" }} />
        </span>
        <span style={{ textAlign: "center" }} title="Email">
          <Mail size={14} style={{ color: "var(--color-text-muted)" }} />
        </span>
      </div>

      {/* Category rows */}
      {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
        <div
          key={category}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 60px 60px",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div>
            <span style={{ fontSize: "var(--dg-fs-body-sm)", fontWeight: 500, color: "var(--color-text-primary)" }}>
              {label}
            </span>
            <span style={{ display: "block", fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", marginTop: 2 }}>
              {CATEGORY_DESCRIPTIONS[category]}
            </span>
          </div>
          <div style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              checked={prefs[category]?.in_app ?? true}
              onChange={() => toggle(category, "in_app")}
              style={{ width: 16, height: 16, accentColor: "var(--color-brand)", cursor: "pointer" }}
            />
          </div>
          <div style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              checked={prefs[category]?.email ?? false}
              onChange={() => toggle(category, "email")}
              style={{ width: 16, height: 16, accentColor: "var(--color-brand)", cursor: "pointer" }}
            />
          </div>
        </div>
      ))}

      <button
        onClick={save}
        disabled={saving}
        className="dg-btn dg-btn-primary"
        style={{ alignSelf: "flex-start", marginTop: 4 }}
      >
        <ButtonLoading loading={saving} spinnerColor="var(--color-text-inverse)" spinnerSize={14}>
          Save Preferences
        </ButtonLoading>
      </button>
    </div>
  );
}
