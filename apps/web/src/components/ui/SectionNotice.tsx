"use client";

import { Banner } from "@/components/ui/Banner";

type SectionNoticeTone = "danger" | "warning";

/**
 * What saving this section would do: access removed, an invitation revoked, a
 * change not reaching where the reader expects it to. `danger` for something
 * taken away, `warning` for something that will not happen.
 *
 * Consequences of the save, not properties of a field. Validation - a required
 * field, a malformed phone number, a duplicate email - stays as the plain
 * coloured footnote under its own input, which is what the rest of the app
 * already does. Two tiers, and a filled box only ever means the first one.
 *
 * It sits at the top of its section rather than under the control that
 * produced it. A box under a field puts a third surface inside an already
 * surfaced panel, and mounts and unmounts on every toggle, jolting the form.
 *
 * One treatment on every surface, the narrow slide-over included. It briefly
 * had a plain-text variant for that column; a section raises at most one of
 * these, so the crowding that argued for it never materialised, and the
 * exception cost more in inconsistency than it saved in width.
 *
 * `messages` is a list so that a section can only ever raise one box: two
 * sibling banners in one section are not representable.
 */
export function SectionNotice({
  messages,
  tone = "danger",
}: {
  messages: string[];
  tone?: SectionNoticeTone;
}) {
  if (messages.length === 0) return null;

  return (
    <Banner tone={tone}>
      {messages.map((message) => (
        <span key={message}>{message}</span>
      ))}
    </Banner>
  );
}
