"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// A stream the browser gave up on, such as after a 404 or 500, is tried again
// this long after.
const REOPEN_MS = 5000;

// Re-renders the page when the viewed Project changes on disk. One stream per
// Project stays open across re-renders, so refreshes follow the server's
// settle time rather than one per reconnect. Viewing another Project closes
// this stream, which stops the server watching this one.
//
// A hidden tab holds no stream, so open tabs do not use up the browser's few
// connections per host. Every stream opens with the version on screen, so the
// server sends any change made while there was none.
export function LiveUpdates({ href, version }: { href: string; version: string }) {
  const router = useRouter();
  const shown = useRef(version);
  useEffect(() => {
    shown.current = version;
  }, [version]);

  useEffect(() => {
    let events: EventSource | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      events = new EventSource(`${href}?version=${shown.current}`);
      events.addEventListener("change", () => router.refresh());
      // The browser retries a dropped connection itself, but not one that
      // ended in an error response; that one ends CLOSED.
      events.addEventListener("error", () => {
        if (events?.readyState !== EventSource.CLOSED) return;
        clearTimeout(reopenTimer);
        reopenTimer = setTimeout(followVisibility, REOPEN_MS);
      });
    };
    const followVisibility = () => {
      if (document.hidden) {
        events?.close();
        events = undefined;
      } else if (events === undefined || events.readyState === EventSource.CLOSED) {
        events?.close();
        open();
      }
    };

    followVisibility();
    document.addEventListener("visibilitychange", followVisibility);
    return () => {
      document.removeEventListener("visibilitychange", followVisibility);
      clearTimeout(reopenTimer);
      events?.close();
    };
  }, [href, router]);
  return null;
}
