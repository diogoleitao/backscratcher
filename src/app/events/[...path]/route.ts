import { decodeSegments, findProject } from "../../project-urls.ts";
import {
  listProjects,
  readRegisteredProject,
  versionOf,
  watchRegisteredProject,
} from "../../projects.ts";

const encoder = new TextEncoder();

// Server-sent events for one registered Project, at the same path as its page.
// The `version` query parameter is the version of the Project the page shows.
// A `change` event follows whenever what the Project reader returns differs
// from the last version sent, starting with the page's; the page then
// re-renders and reconnects with its new version.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: rawSegments } = await params;
  const projectList = await listProjects();
  if ("error" in projectList) return new Response(projectList.error, { status: 500 });
  // Only registered Projects resolve, so the URL cannot watch other folders.
  const segments = decodeSegments(rawSegments);
  const project = findProject(projectList.projects, segments);
  if (project === undefined) {
    return new Response(`/${segments.join("/")} is not a registered Project.`, { status: 404 });
  }

  let last = new URL(request.url).searchParams.get("version");
  let reading = Promise.resolve();
  let closed = false;
  let stopWatching = () => {};
  const stop = () => {
    closed = true;
    stopWatching();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        stop();
        controller.close();
      };
      if (request.signal.aborted) return close();
      request.signal.addEventListener("abort", close);

      // One read at a time, so versions are compared in the order taken.
      const check = () => {
        reading = reading.then(async () => {
          const next = versionOf(await readRegisteredProject(project));
          if (closed || next === last) return;
          last = next;
          controller.enqueue(encoder.encode("event: change\ndata:\n\n"));
        });
      };
      // The first check runs once the watch is in place, so a change made
      // after the page was read is either in that check or seen by the watch.
      void watchRegisteredProject(project, check).then((stopProjectWatch) => {
        if (closed) return stopProjectWatch();
        stopWatching = stopProjectWatch;
        check();
      });

      // A comment sends the headers now, so the browser sees the stream open.
      controller.enqueue(encoder.encode(": watching\n\n"));
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // no-transform keeps compression from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
