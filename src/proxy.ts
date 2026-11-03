import { NextResponse, type NextRequest } from "next/server";
import { isLoopbackHost } from "./app/host.ts";

// Runs before every request, with no matcher, so pages, server actions and
// the live updates stream all sit behind it under both `next dev` and the CLI.
export function proxy(request: NextRequest): NextResponse | undefined {
  if (isLoopbackHost(request.headers.get("host"))) return undefined;
  return new NextResponse("Forbidden: Host must be 127.0.0.1 or localhost\n", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
