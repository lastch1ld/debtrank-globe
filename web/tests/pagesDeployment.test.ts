import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("GitHub Pages deployment contract", () => {
  it("uses the repository subpath only for production builds", () => {
    const config = read("vite.config.ts");
    expect(config).toContain('command === "build" ? "/debtrank-globe/" : "/"');
  });

  it("loads network snapshots relative to Vite's base URL", () => {
    const network = read("src/lib/network.ts");
    expect(network).toContain("import.meta.env.BASE_URL");
    expect(network).not.toContain('fetch(`/data/network/');
  });

  it("deploys only successful master CI runs with official Pages actions", () => {
    const workflow = read("../.github/workflows/pages.yml");
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("workflows: [CI]");
    expect(workflow).toContain("branches: [master]");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("actions/upload-pages-artifact@v3");
    expect(workflow).toContain("actions/deploy-pages@v4");
  });
});
