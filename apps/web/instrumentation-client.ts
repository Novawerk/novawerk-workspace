// Runs once per page load, before React hydrates: counts the first page view, every client
// navigation after it, and clicks on links marked with trackClick(). See lib/analytics.ts.

import { flush, onTrackedClick, trackPageView } from "@/lib/analytics";

let lastPath = window.location.pathname;

try {
  trackPageView(lastPath, true);
  document.addEventListener("click", onTrackedClick, { capture: true });
  // Send what's queued when the visitor leaves or switches away; mobile browsers may not
  // come back to a hidden page.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
} catch {
  // Counting must never break the site.
}

export function onRouterTransitionStart(url: string) {
  const path = new URL(url, window.location.href).pathname;
  if (path === lastPath) return;
  lastPath = path;
  trackPageView(path, false);
}
