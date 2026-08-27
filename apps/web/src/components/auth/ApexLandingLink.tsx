"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { parseHost } from "@/lib/subdomain";

export function getApexLandingHref(protocol: string, host: string): string {
  const { rootDomain, port } = parseHost(host);
  return `${protocol}//${rootDomain}${port}/`;
}

export function ApexLandingLink({
  onClick,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof Link>, "href">) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    window.location.assign(getApexLandingHref(window.location.protocol, window.location.host));
  }

  return (
    <Link
      href="/"
      prefetch={false}
      aria-label="Go to DubGrid home"
      {...props}
      onClick={handleClick}
    />
  );
}
