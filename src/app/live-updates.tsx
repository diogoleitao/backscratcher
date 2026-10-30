"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the page when the viewed Project changes on disk. href names the
// Project and the version on screen, so each render reconnects with its own
// version, and viewing another Project closes this stream, which stops the
// server watching this one.
//
// A hidden tab holds no stream, so open tabs do not use up the browser's few
// connections per host. When the tab shows again, the server compares against
// the version on screen and sends any change made in the meantime.
export function LiveUpdates({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    let events: EventSource | undefined;
    const followVisibility = () => {
      if (document.hidden) {
        events?.close();
        events = undefined;
      } else if (events === undefined) {
        events = new EventSource(href);
        events.addEventListener("change", () => router.refresh());
      }
    };
    followVisibility();
    document.addEventListener("visibilitychange", followVisibility);
    return () => {
      document.removeEventListener("visibilitychange", followVisibility);
      events?.close();
    };
  }, [href, router]);
  return null;
}
