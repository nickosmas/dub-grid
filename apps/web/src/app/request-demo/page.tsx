"use client";

import { useState } from "react";
import {
  getRequiredStaffEmailError,
  getStaffNameError,
  normalizeOptionalUsPhone,
} from "@dubgrid/contracts";
import Link from "next/link";
import { toast } from "sonner";
import CustomSelect from "@/components/CustomSelect";
import { Form } from "@/components/Form";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { PageShell, Card } from "@/components/auth/AuthCard";
import { CheckCircle } from "lucide-react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import {
  getLineTextError,
  getMultilineTextError,
  getOptionalUsPhoneFieldError,
  normalizeLineText,
  normalizeMultilineText,
} from "@/lib/form-validation";

const ORG_SIZE_OPTIONS = ["1-25", "26-50", "51-100", "101-250", "250+"];

type DemoField = "contactName" | "email" | "phone" | "orgName" | "industry" | "message";

function RequiredMark() {
  return (
    <span aria-hidden="true" className="dg-auth-required">
      *
    </span>
  );
}

export default function RequestDemoPage() {
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSize, setOrgSize] = useState("");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // A field the visitor has not reached yet is not wrong yet: without this the
  // page opens already accusing them of three missing required fields.
  const [touched, setTouched] = useState<Partial<Record<DemoField, boolean>>>({});
  const touch = (field: DemoField) => setTouched((prev) => ({ ...prev, [field]: true }));
  const contactNameError = getStaffNameError(contactName, "Contact name");
  const emailError = getRequiredStaffEmailError(email);
  const phoneError = getOptionalUsPhoneFieldError(phone);
  const orgNameError = getLineTextError(orgName, {
    label: "Organization name",
    maxLength: 200,
    required: true,
  });
  const industryError = getLineTextError(industry, {
    label: "Industry / facility type",
    maxLength: 200,
  });
  const messageError = getMultilineTextError(message, {
    label: "Additional notes",
    maxLength: 2000,
  });
  const shownError = (field: DemoField, error: string | null | undefined) =>
    touched[field] ? (error ?? null) : null;
  const hasValidationErrors = Boolean(
    contactNameError || emailError || phoneError || orgNameError || industryError || messageError,
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (
      !contactName.trim() ||
      !email.trim() ||
      !orgName.trim() ||
      !orgSize ||
      hasValidationErrors
    ) {
      toast.error(
        contactNameError ??
          emailError ??
          phoneError ??
          orgNameError ??
          industryError ??
          messageError ??
          "Please fill in all required fields.",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/request-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: normalizeLineText(contactName, {
            label: "Contact name",
            maxLength: 80,
            required: true,
          }),
          email: email.trim().toLowerCase(),
          phone: normalizeOptionalUsPhone(phone),
          orgName: normalizeLineText(orgName, {
            label: "Organization name",
            maxLength: 200,
            required: true,
          }),
          orgSize,
          industry: normalizeLineText(industry, {
            label: "Industry / facility type",
            maxLength: 200,
          }),
          message: normalizeMultilineText(message, {
            label: "Additional notes",
            maxLength: 2000,
          }),
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else if (res.status === 429) {
        toast.error("Too many requests. Wait a few minutes and try again.");
      } else {
        toast.error("Something went wrong. Try again.");
      }
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <PageShell>
        <Card>
          <div className="dg-auth-icon-tile dg-auth-icon-tile--success">
            <CheckCircle size={28} />
          </div>
          <h1 className="dg-font-brand-heading dg-auth-heading dg-auth-state-heading">
            Demo request submitted
          </h1>
          <p aria-live="polite" className="dg-auth-state-message">
            Thanks, {contactName}! We&apos;ll review your request and get back to you shortly.
          </p>
          <Link href="/" className="dg-btn dg-btn-primary dg-btn-lg dg-auth-state-primary">
            Back to home
          </Link>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card>
        <Link href="/" className="dg-auth-logo-block dg-auth-logo-block--spacious">
          <DubGridLogo size={52} />
          <DubGridWordmark />
        </Link>

        <h1 className="dg-font-brand-heading dg-auth-heading dg-auth-page-heading">
          Request a demo
        </h1>
        <p className="dg-auth-description">
          Tell us about your organization and we&apos;ll be in touch.
        </p>

        <Form onSubmit={handleSubmit} className="dg-auth-form">
          <div>
            <label htmlFor="demo-contact-name" className="dg-auth-field-label">
              Contact name <RequiredMark />
            </label>
            <input
              id="demo-contact-name"
              type="text"
              required
              autoComplete="name"
              className={`dg-auth-input${shownError("contactName", contactNameError) ? " dg-auth-input--error" : ""}`}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Your full name"
              onBlur={() => touch("contactName")}
            />
            {shownError("contactName", contactNameError) ? (
              <p className="dg-form-error">{contactNameError}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="demo-email" className="dg-auth-field-label">
              Email <RequiredMark />
            </label>
            <input
              id="demo-email"
              type="email"
              required
              autoComplete="email"
              className={`dg-auth-input${shownError("email", emailError) ? " dg-auth-input--error" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              onBlur={() => touch("email")}
            />
            {shownError("email", emailError) ? <p className="dg-form-error">{emailError}</p> : null}
          </div>
          <div>
            <label htmlFor="demo-phone" className="dg-auth-field-label">
              Phone
            </label>
            <input
              id="demo-phone"
              type="tel"
              autoComplete="tel"
              className={`dg-auth-input${shownError("phone", phoneError) ? " dg-auth-input--error" : ""}`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(optional)"
              onBlur={() => {
                touch("phone");
                if (!phoneError && phone.trim()) {
                  setPhone(normalizeOptionalUsPhone(phone));
                }
              }}
            />
            {shownError("phone", phoneError) ? <p className="dg-form-error">{phoneError}</p> : null}
          </div>

          <div>
            <label htmlFor="demo-org-name" className="dg-auth-field-label">
              Organization name <RequiredMark />
            </label>
            <input
              id="demo-org-name"
              type="text"
              required
              autoComplete="organization"
              className={`dg-auth-input${shownError("orgName", orgNameError) ? " dg-auth-input--error" : ""}`}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your company or facility name"
              onBlur={() => touch("orgName")}
            />
            {shownError("orgName", orgNameError) ? (
              <p className="dg-form-error">{orgNameError}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="demo-org-size" className="dg-auth-field-label">
              Employee count <RequiredMark />
            </label>
            {/* CustomSelect puts its `style` on the wrapper, not the trigger,
                so the trigger's chrome is matched to the text fields from CSS
                (see .dg-auth-select). */}
            <div className="dg-auth-select">
              <CustomSelect
                id="demo-org-size"
                ariaLabel="Employee count"
                value={orgSize || ""}
                options={[
                  { value: "", label: "Select range" },
                  ...ORG_SIZE_OPTIONS.map((opt) => ({ value: opt, label: opt })),
                ]}
                onChange={setOrgSize}
                height="var(--dg-auth-control-h)"
                fontSize="var(--dg-fs-body)"
                fontWeight="var(--dg-type-control-weight)"
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <div>
            <label htmlFor="demo-industry" className="dg-auth-field-label">
              Industry / facility type
            </label>
            <input
              id="demo-industry"
              type="text"
              className={`dg-auth-input${shownError("industry", industryError) ? " dg-auth-input--error" : ""}`}
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Residential Care"
              onBlur={() => touch("industry")}
            />
            {shownError("industry", industryError) ? (
              <p className="dg-form-error">{industryError}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="demo-message" className="dg-auth-field-label">
              Anything else we should know?
            </label>
            <textarea
              id="demo-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Tell us about your scheduling challenges, team size, or any questions..."
              onBlur={() => touch("message")}
              className={`dg-auth-input dg-auth-textarea${shownError("message", messageError) ? " dg-auth-input--error" : ""}`}
            />
            {shownError("message", messageError) ? (
              <p className="dg-form-error">{messageError}</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={loading || hasValidationErrors}
            className="dg-btn dg-btn-primary dg-btn-lg dg-auth-submit"
          >
            <ButtonLoading
              loading={loading}
              spinnerColor="var(--dg-color-text-inverse)"
              spinnerSize={20}
            >
              Submit request
            </ButtonLoading>
          </button>
        </Form>

        <div className="dg-auth-back-link">
          <Link href="/" className="dg-auth-link dg-auth-link--subtle">
            Back to home
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
