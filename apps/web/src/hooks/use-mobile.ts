import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const COMPACT_BREAKPOINT = 1199;

function useMaxWidth(maxWidth: number) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth <= maxWidth);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth <= maxWidth);
    return () => mql.removeEventListener("change", onChange);
  }, [maxWidth]);

  return !!isMobile;
}

export function useIsMobile() {
  return useMaxWidth(MOBILE_BREAKPOINT - 1);
}

export function useIsCompactScreen() {
  return useMaxWidth(COMPACT_BREAKPOINT);
}
