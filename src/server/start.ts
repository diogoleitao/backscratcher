import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import next from "next";
import type { ServerOptions } from "./options.js";

const HOST = "127.0.0.1";

// Under NodeNext, TypeScript types the CommonJS default import as the module
// namespace, but at runtime it is `module.exports`, which is the factory itself.
const createNextServer = next as unknown as typeof next.default;

export class PortInUseError extends Error {
  constructor(readonly port: number) {
    super(`port ${port} is already in use`);
  }
}

export async function startServer(
  options: ServerOptions & { appDir: string; log: (text: string) => void },
): Promise<void> {
  const { log } = options;
  const app = createNextServer({ dev: false, dir: options.appDir, hostname: HOST, port: options.port });
  const handle = app.getRequestHandler();
  let ready: Promise<void> | undefined;

  const server = createServer((req, res) => {
    // Listening starts before Next is prepared so a taken port fails fast;
    // requests that arrive in between wait for it.
    ready!
      .then(() => handle(req, res))
      .catch((error: Error) => {
        log(`request failed: ${error.message}\n`);
        res.statusCode = 500;
        res.end();
      });
  });
  await listen(server, options.port);
  server.on("error", (error) => {
    log(`server error: ${error.message}\n`);
    process.exit(1);
  });

  ready = app.prepare();
  await ready;

  const url = `http://${HOST}:${options.port}`;
  log(`backscratcher running at ${url}\n`);
  if (options.open) openBrowser(url, log);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      reject(error.code === "EADDRINUSE" ? new PortInUseError(port) : error);
    };
    server.once("error", onError);
    server.listen(port, HOST, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function openBrowser(url: string, log: (text: string) => void): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => log(`open ${url} in your browser\n`));
  child.unref();
}
