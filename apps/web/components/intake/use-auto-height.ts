"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Grows a textarea with its text, up to `max` pixels (then it scrolls). Re-measures when the
 * width changes too — including when a hidden tab (display: none, width 0) becomes visible.
 */
export function useAutoHeight(ref: RefObject<HTMLTextAreaElement | null>, value: string, max: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      if (el.offsetWidth === 0) return; // Hidden: measuring now would collapse it.
      el.style.height = "auto";
      const border = el.offsetHeight - el.clientHeight;
      const height = el.scrollHeight + border;
      el.style.height = `${Math.min(height, max)}px`;
      el.style.overflowY = height > max ? "auto" : "hidden";
    };
    resize();

    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, value, max]);
}
