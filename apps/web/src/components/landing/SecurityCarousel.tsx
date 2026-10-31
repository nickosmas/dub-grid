"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  History,
  KeyRound,
  Mail,
  MonitorSmartphone,
  type LucideIcon,
} from "lucide-react";
import { INVITATION_LIFETIME_HOURS } from "@dubgrid/domain";

const CARDS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Mail,
    title: "Invite only",
    description: `Every account starts from a personal link that expires in ${INVITATION_LIFETIME_HOURS} hours.`,
  },
  {
    icon: KeyRound,
    title: "Two-factor sign-in",
    description: "Add a code from an authenticator app to every sign-in.",
  },
  {
    icon: BellRing,
    title: "Account alerts",
    description: "People hear about new sign-ins and changes to their account.",
  },
  {
    icon: MonitorSmartphone,
    title: "Signed-in devices",
    description: "See where you're signed in and sign out anywhere.",
  },
  {
    icon: History,
    title: "Activity log",
    description: "See who changed what, and when.",
  },
];

/**
 * Every card in one row where they fit. On narrower windows the row scrolls
 * sideways, with a chevron on each side that has more to show.
 */
export function SecurityCarousel() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const end = track.scrollWidth - track.clientWidth;
    setCanScroll({ back: track.scrollLeft > 4, forward: track.scrollLeft < end - 4 });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    track.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      track.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const scrollByCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.firstElementChild;
    if (!track || !(card instanceof HTMLElement)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({
      left: direction * (card.offsetWidth + 16),
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return (
    <div className="landing-carousel">
      <ul ref={trackRef} className="landing-carousel-track" aria-label="Security features">
        {CARDS.map(({ icon: Icon, title, description }) => (
          <li key={title} className="landing-security-card">
            <span className="landing-security-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <h3 className="dg-font-brand-heading landing-security-title">{title}</h3>
            <p className="landing-security-text">{description}</p>
          </li>
        ))}
      </ul>
      {canScroll.back && (
        <button
          type="button"
          className="landing-carousel-arrow"
          data-side="back"
          aria-label="Previous"
          onClick={() => scrollByCard(-1)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      )}
      {canScroll.forward && (
        <button
          type="button"
          className="landing-carousel-arrow"
          data-side="forward"
          aria-label="Next"
          onClick={() => scrollByCard(1)}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
