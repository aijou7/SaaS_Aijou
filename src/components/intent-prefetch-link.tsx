"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  type ComponentProps,
  type FocusEvent,
  type MouseEvent,
} from "react";

type IntentPrefetchLinkProps = Omit<ComponentProps<typeof Link>, "prefetch">;

const hoverIntentDelayMs = 120;

export function IntentPrefetchLink({
  href,
  onBlur,
  onClick,
  onFocus,
  onMouseEnter,
  onMouseLeave,
  ...props
}: IntentPrefetchLinkProps) {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);

  const cancelPendingPrefetch = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedulePrefetch = () => {
    cancelPendingPrefetch();
    timerRef.current = window.setTimeout(() => {
      router.prefetch(String(href));
      timerRef.current = null;
    }, hoverIntentDelayMs);
  };

  useEffect(() => cancelPendingPrefetch, []);

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        cancelPendingPrefetch();
        onClick?.(event);
      }}
      onBlur={(event: FocusEvent<HTMLAnchorElement>) => {
        cancelPendingPrefetch();
        onBlur?.(event);
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        schedulePrefetch();
        onFocus?.(event);
      }}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        schedulePrefetch();
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event: MouseEvent<HTMLAnchorElement>) => {
        cancelPendingPrefetch();
        onMouseLeave?.(event);
      }}
    />
  );
}
