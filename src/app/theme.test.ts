import { describe, expect, it } from "vitest";
import { themeFromCookie } from "./theme.ts";

describe("themeFromCookie", () => {
  it("gives auto when there is no cookie", () => {
    expect(themeFromCookie(undefined)).toBe("auto");
  });

  it("gives the theme the dev chose", () => {
    expect(themeFromCookie("light")).toBe("light");
    expect(themeFromCookie("dark")).toBe("dark");
    expect(themeFromCookie("auto")).toBe("auto");
  });

  it("gives auto for a value that names no theme, so it never reaches the page", () => {
    expect(themeFromCookie("")).toBe("auto");
    expect(themeFromCookie("Dark")).toBe("auto");
    expect(themeFromCookie('dark" onload="alert(1)')).toBe("auto");
  });
});
