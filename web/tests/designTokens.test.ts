import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../src");
const css = readFileSync(resolve(SRC, "ui/tokens.css"), "utf8");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });

const defined = new Map([...css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));

describe("tokens.css", () => {
  it("holds hex values for everything the WebGL and chart layers read", () => {
    const readByJs = [...defined].filter(
      ([name]) => name.startsWith("--viz-") || name.startsWith("--distress-"),
    );
    expect(readByJs.length).toBeGreaterThan(10);
    for (const [name, value] of readByJs)
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("defines every token the source reads", () => {
    const used = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/token\(\s*"(--[\w-]+)"/g)) used.add(m[1]);
      for (const m of text.matchAll(/var\((--(?:viz|distress)-[\w-]+)\)/g))
        used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    for (const name of used)
      expect(defined.has(name), `${name} is used but not defined`).toBe(true);
  });

  it("is the only place a hex colour is written", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => !f.endsWith("tokens.css"))
      .filter((f) => /#[0-9a-fA-F]{6}\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("the ui kit", () => {
  it("imports nothing from outside src/ui", () => {
    const escapes: string[] = [];
    for (const file of sourceFiles(join(SRC, "ui"))) {
      for (const m of readFileSync(file, "utf8").matchAll(/from\s+"(\.[^"]*)"/g)) {
        if (m[1].startsWith("../")) escapes.push(`${file}: ${m[1]}`);
      }
    }
    expect(escapes).toEqual([]);
  });
});
