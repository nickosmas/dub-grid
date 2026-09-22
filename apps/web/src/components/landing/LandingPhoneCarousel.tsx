"use client";

import { useEffect, useRef, useState } from "react";
import { LandingPhone, type LandingPhoneScreen } from "./LandingPhone";

const SCREENS: LandingPhoneScreen[] = ["home", "schedule", "requests"];
const INITIAL_INDEX = 1;

/**
 * The three phones on the landing page. On desktop they sit side by side; on
 * narrow viewports they become a horizontal snap scroller where the phone
 * nearest the centre renders at full size and its neighbours fall back.
 */
export function LandingPhoneCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(INITIAL_INDEX);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const items = Array.from(track.children) as HTMLElement[];
    const isScroller = () => track.scrollWidth > track.clientWidth + 1;

    // Start on the middle phone; scrollIntoView would also scroll the page.
    const middle = items[INITIAL_INDEX];
    if (middle && isScroller()) {
      track.scrollLeft = middle.offsetLeft + middle.offsetWidth / 2 - track.clientWidth / 2;
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!isScroller()) {
        setActiveIndex(-1);
        return;
      }
      const centre = track.scrollLeft + track.clientWidth / 2;
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      items.forEach((item, index) => {
        const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - centre);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
      });
      setActiveIndex(nearest);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    measure();
    track.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      track.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={trackRef} className="landing-phone-track">
      {SCREENS.map((screen, index) => (
        <div
          key={screen}
          className="landing-phone-slot"
          data-active={activeIndex === -1 || activeIndex === index ? "true" : undefined}
        >
          <LandingPhone screen={screen} />
        </div>
      ))}
    </div>
  );
}
