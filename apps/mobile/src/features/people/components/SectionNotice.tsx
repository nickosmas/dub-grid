import { Banner } from "../../../shared/components/Banner";

/**
 * What saving this section would do: `danger` for something taken away,
 * `warning` for something replaced or not happening. The mobile counterpart of
 * web's `SectionNotice`, so both apps say it in the same words in the same place.
 *
 * Consequences of the save, not properties of a field. Validation stays as the
 * plain red hint the choice groups and inputs already carry, so a filled box
 * only ever means the first of those two.
 *
 * `messages` is a list so a section can only ever raise one box.
 */
export function SectionNotice({
  messages,
  tone = "danger",
}: {
  messages: string[];
  tone?: "danger" | "warning";
}) {
  if (messages.length === 0) return null;

  return <Banner tone={tone}>{messages}</Banner>;
}
