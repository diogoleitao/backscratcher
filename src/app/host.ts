// A loopback hostname, on any port: the server only answers on the one it
// listens on.
const LOOPBACK_HOST_PATTERN = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/;

// Whether a request's Host header names the loopback address. A page on
// another domain that resolves to 127.0.0.1 (DNS rebinding) sends its own
// domain here, so this is what keeps it from reaching the app.
export function isLoopbackHost(host: string | null): boolean {
  return host !== null && LOOPBACK_HOST_PATTERN.test(host);
}
