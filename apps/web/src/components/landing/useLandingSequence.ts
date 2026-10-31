"use client";

import { useEffect, useRef, useState } from "react";
import { nextLoopStep } from "./landing-demo-logic";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

/**
 * Loops an illustration through its steps, holding each for its duration.
 * It only runs while the illustration is on screen, and under reduced motion
 * it rests on `restingStep`, the state that tells the whole story.
 */
export function useLandingSequence<T extends HTMLElement = HTMLDivElement>(
  durations: readonly number[],
  restingStep = durations.length - 1,
) {
  const ref = useRef<T>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.25,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || !visible) return;
    const timer = window.setTimeout(
      () => setStep((current) => nextLoopStep(current, durations.length)),
      durations[step] ?? 0,
    );
    return () => window.clearTimeout(timer);
  }, [durations, reducedMotion, step, visible]);

  return { ref, step: reducedMotion ? restingStep : step };
}
