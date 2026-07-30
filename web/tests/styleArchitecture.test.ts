import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Tailwind style architecture", () => {
  it("uses the Tailwind Vite plugin and import-only global stylesheet", () => {
    expect(read("vite.config.ts")).toContain('@tailwindcss/vite');
    expect(read("vite.config.ts")).toContain("tailwindcss()");
    expect(read("src/index.css").trim()).toBe('@import "tailwindcss";');
  });

  it("does not retain the legacy application stylesheet", () => {
    expect(existsSync(resolve(root, "src/App.css"))).toBe(false);
    expect(read("src/App.tsx")).not.toContain('./App.css');
  });
});
