import { describe, expect, it } from "vitest";
import { resolveServerOptions } from "./options.js";

describe("resolveServerOptions", () => {
  it("defaults to port 4747 and opening the browser", () => {
    expect(resolveServerOptions({ flags: {}, settings: {} })).toEqual({
      port: 4747,
      open: true,
    });
  });

  it("uses configured values over the defaults", () => {
    expect(
      resolveServerOptions({ flags: {}, settings: { port: 5050, open: false } }),
    ).toEqual({ port: 5050, open: false });
  });

  it("uses flags over configured values", () => {
    expect(
      resolveServerOptions({
        flags: { port: 6060, open: false },
        settings: { port: 5050, open: true },
      }),
    ).toEqual({ port: 6060, open: false });
  });
});
