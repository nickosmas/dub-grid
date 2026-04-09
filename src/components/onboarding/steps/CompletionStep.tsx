"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";

interface CompletionStepProps {
  role: string;
  onComplete: () => Promise<void>;
  isOrgSetup?: boolean;
}

export default function CompletionStep({ role, onComplete, isOrgSetup }: CompletionStepProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isSuperAdmin = role === "super_admin";
  const isSaOrientation = isSuperAdmin && (isOrgSetup ?? false);
  const isUser = role === "user";

  const heading = isSuperAdmin && !isSaOrientation
    ? "Your Workspace is Ready!"
    : "You\u2019re All Set!";

  const subtext = isSaOrientation
    ? "You have full super admin access. Head to the dashboard to see how things are running."
    : isSuperAdmin
      ? "Everything is configured and ready to go. Next, head to the People page to add your employees and start building schedules."
      : isUser
        ? "You\u2019re all set up. Head to the schedule to see your upcoming shifts."
        : "Your account is set up and ready. Head to the dashboard to get started.";

  const ctaLabel = isSaOrientation
    ? "Go to Dashboard"
    : isSuperAdmin
      ? "Go to People"
      : isUser
        ? "View My Schedule"
        : "Go to Dashboard";

  const destination = isSaOrientation
    ? "/dashboard"
    : isUser ? "/schedule" : isSuperAdmin ? "/people" : "/dashboard";

  async function handleComplete() {
    setLoading(true);
    try {
      router.push(destination);
      await onComplete();
    } catch (err) {
      Sentry.captureException(err);
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      {/* Success animation */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "var(--color-brand)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 28px",
          boxShadow: "0 8px 24px rgba(0, 95, 2, 0.3)",
          animation: "onboarding-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        <Check size={40} color="white" strokeWidth={3} />
      </div>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: "var(--color-text-primary)",
          margin: "0 0 12px",
          letterSpacing: "-0.03em",
        }}
      >
        {heading}
      </h1>

      <p
        style={{
          fontSize: 16,
          color: "var(--color-text-muted)",
          lineHeight: 1.6,
          margin: "0 0 40px",
          maxWidth: 380,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {subtext}
      </p>

      <button
        onClick={handleComplete}
        disabled={loading}
        type="button"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 32px",
          borderRadius: 12,
          border: "none",
          background: "var(--color-brand)",
          color: "var(--color-text-inverse)",
          fontSize: 16,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "transform 150ms ease, box-shadow 150ms ease",
          boxShadow: "0 4px 16px rgba(0, 95, 2, 0.25)",
        }}
      >
        <ButtonLoading
          loading={loading}
          spinnerColor="var(--color-text-inverse)"
          spinnerSize={20}
        >
          {ctaLabel}
          {!loading && <ArrowRight size={18} />}
        </ButtonLoading>
      </button>

      {/* Pop animation keyframes */}
      <style>{`
        @keyframes onboarding-pop {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
