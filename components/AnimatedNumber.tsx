"use client";

import { useEffect, useRef, useState } from "react";

/** Smooth count-up whenever the value changes. */
export function AnimatedNumber({
  value,
  format,
  durationMs = 700,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState<number>(
    Number.isFinite(value) ? value : 0
  );
  const prevRef = useRef<number>(Number.isFinite(value) ? value : 0);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const start = prevRef.current;
    const end = value;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + (end - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <>{format(display)}</>;
}
