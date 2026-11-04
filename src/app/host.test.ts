import { describe, expect, it } from "vitest";
import { isLoopbackHost } from "./host.ts";

describe("isLoopbackHost", () => {
  it("allows 127.0.0.1 with a port", () => {
    expect(isLoopbackHost("127.0.0.1:4747")).toBe(true);
  });

  it("allows localhost with a port", () => {
    expect(isLoopbackHost("localhost:5050")).toBe(true);
  });

  it("allows both loopback hostnames without a port", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
  });

  it("rejects another hostname", () => {
    expect(isLoopbackHost("evil.com:4747")).toBe(false);
  });

  it("rejects a hostname that only starts or ends with a loopback one", () => {
    expect(isLoopbackHost("localhost.evil.com")).toBe(false);
    expect(isLoopbackHost("evil127.0.0.1")).toBe(false);
  });

  it("rejects a missing Host", () => {
    expect(isLoopbackHost(null)).toBe(false);
  });
});
