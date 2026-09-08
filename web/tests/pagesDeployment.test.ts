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
    // The identity of the actions is the contract — deploying through
    // GitHub's own Pages actions rather than a third-party deployer.
    // Which major they're pinned at is not: asserting the exact version
    // turns every legitimate upgrade into a failing test, which is how
    // this one failed when checkout/setup-node moved off the deprecated
    // Node 20 runtime and the Pages actions came along with them.
    expect(workflow).toMatch(/actions\/upload-pages-artifact@v\d+/);
    expect(workflow).toMatch(/actions\/deploy-pages@v\d+/);
  });
});
