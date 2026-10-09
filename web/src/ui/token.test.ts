import { afterEach, describe, expect, it, vi } from "vitest";
import { token } from "./token";

describe("token()", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (values: Record<string, string>) => {
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => values[name] ?? "",
    }));
  };

  it("returns the trimmed value of a custom property", () => {
    stub({ "--viz-accent": " #38bdf8 " });
    expect(token("--viz-accent")).toBe("#38bdf8");
  });

  it("throws on a missing token instead of returning an empty string", () => {
    stub({});
    expect(() => token("--viz-nope")).toThrow(
      "Missing design token --viz-nope",
    );
  });
});
