"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the page when the viewed Project changes on disk. href names the
// Project and the version on screen, so each render reconnects with its own
// version, and viewing another Project closes this stream, which stops the
// server watching this one.
export function LiveUpdates({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const events = new EventSource(href);
    events.addEventListener("change", () => router.refresh());
    return () => events.close();
  }, [href, router]);
  return null;
}
