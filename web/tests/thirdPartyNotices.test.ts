import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  packageRoot,
  readPackage,
  renderNotices,
} from "../build/thirdPartyNotices";

describe("packageRoot", () => {
  it("finds the package of a module, scoped or not, on either path style", () => {
    expect(packageRoot("/app/node_modules/react/index.js")).toBe(
      "/app/node_modules/react",
    );
    expect(packageRoot("/app/node_modules/@react-three/fiber/dist/x.js")).toBe(
      "/app/node_modules/@react-three/fiber",
    );
    expect(
      packageRoot(String.raw`C:\app\node_modules\three\build\three.module.js`),
    ).toBe("C:/app/node_modules/three");
  });

  it("uses the innermost node_modules, so a nested copy resolves to itself", () => {
    expect(packageRoot("/app/node_modules/a/node_modules/b/index.js")).toBe(
      "/app/node_modules/a/node_modules/b",
    );
  });

  it("ignores the app's own modules, virtual modules and query suffixes", () => {
    expect(packageRoot("/app/src/App.tsx")).toBeNull();
    expect(packageRoot("\0vite/preload-helper")).toBeNull();
    expect(
      packageRoot("/app/node_modules/react/index.js?commonjs-es-import"),
    ).toBe("/app/node_modules/react");
  });
});

describe("readPackage", () => {
  const fixture = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "notices-"));
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, ".."), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    return dir;
  };

  it("reads a real package: name, version, declared licence and its licence text", () => {
    const react = readPackage(
      resolve(import.meta.dirname, "../node_modules/react"),
    );
    expect(react).toMatchObject({ name: "react", license: "MIT" });
    expect(react.licenseText).toContain("Permission is hereby granted");
  });

  it("takes the licence from the file when the manifest omits the field", () => {
    const dir = fixture({
      "package.json": '{"name":"x","version":"1.0.0"}',
      LICENSE: "MIT License\n\nCopyright (c) x",
    });
    expect(readPackage(dir)).toMatchObject({
      license: "see licence text",
      licenseText: "MIT License\n\nCopyright (c) x",
    });
  });

  it("says so, instead of printing undefined, when there is neither", () => {
    const dir = fixture({ "package.json": '{"name":"x","version":"1.0.0"}' });
    const pkg = readPackage(dir);
    expect(pkg.license).toBe("not declared");
    expect(renderNotices([pkg])).toContain("No licence file in the package");
  });

  it("accepts the old `licenses` array and picks up a NOTICE file", () => {
    const dir = fixture({
      "package.json":
        '{"name":"y","version":"2.0.0","licenses":[{"type":"Apache-2.0"}]}',
      "LICENSE.md": "Apache License",
      NOTICE: "Product includes software by Z.",
    });
    expect(readPackage(dir)).toMatchObject({
      license: "Apache-2.0",
      noticeText: "Product includes software by Z.",
    });
  });

  it("throws on a directory that is not a package", () => {
    expect(() => readPackage(fixture({ "readme.txt": "hi" }))).toThrow(
      "No package.json",
    );
  });
});

describe("renderNotices", () => {
  const pkg = (name: string, version: string) => ({
    name,
    version,
    license: "MIT",
    licenseText: `licence of ${name}`,
    noticeText: null,
  });

  it("lists every package with its licence text, sorted, with a count", () => {
    const text = renderNotices([pkg("three", "0.1.0"), pkg("react", "1.0.0")]);
    expect(text).toContain("2 packages.");
    expect(text.indexOf("react 1.0.0 (MIT)")).toBeLessThan(
      text.indexOf("three 0.1.0 (MIT)"),
    );
    expect(text).toContain("licence of react");
    expect(text).toContain("licence of three");
  });

  it("says which licence covers the app itself", () => {
    expect(renderNotices([])).toContain("own code is MIT-licensed");
  });
});
