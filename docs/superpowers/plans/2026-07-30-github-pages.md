# GitHub Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Debtrank automatically at `https://lastch1ld.github.io/debtrank-globe/` after successful CI on `master`.

**Architecture:** Vite will emit production assets beneath `/debtrank-globe/`, and runtime network requests will use `import.meta.env.BASE_URL`. A GitHub Actions workflow triggered by successful CI will build `web/dist` and deploy it with GitHub's official Pages actions.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Vitest, GitHub Actions, GitHub Pages

## Global Constraints

- Preserve root-based local development.
- Deploy only successful `master` CI runs.
- Do not commit generated `dist` files.
- Do not change simulation, financial models, or visualization behavior.
- Use only the permissions required for GitHub Pages deployment.

---

### Task 1: Production subpath support

**Files:**
- Create: `web/tests/pagesDeployment.test.ts`
- Modify: `web/vite.config.ts`
- Modify: `web/src/lib/network.ts`

**Interfaces:**
- Consumes: Vite's `command` configuration value and `import.meta.env.BASE_URL`.
- Produces: `/debtrank-globe/` production asset paths and base-relative network data requests.

- [ ] **Step 1: Add the failing deployment contract test**

Create `web/tests/pagesDeployment.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the test and verify the intended failure**

Run:

```bash
cd web
npm test -- tests/pagesDeployment.test.ts
```

Expected: FAIL because Vite has no Pages base and `network.ts` still fetches from `/data`.

- [ ] **Step 3: Configure Vite's build base**

Change `web/vite.config.ts` to:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/debtrank-globe/" : "/",
  plugins: [react(), tailwindcss()],
}));
```

- [ ] **Step 4: Make static data loading base-relative**

In `loadYearData`, replace the absolute fetch with:

```ts
const dataUrl = `${import.meta.env.BASE_URL}data/network/${year}.json`;
const res = await fetch(dataUrl);
```

- [ ] **Step 5: Verify the focused behavior**

Run:

```bash
cd web
npm test -- tests/pagesDeployment.test.ts
npm run build
rg -n '/debtrank-globe/' dist/index.html
```

Expected: the focused test and build pass, and `dist/index.html` references assets under `/debtrank-globe/`.

- [ ] **Step 6: Commit the subpath slice**

```bash
git add web/tests/pagesDeployment.test.ts web/vite.config.ts web/src/lib/network.ts
git commit -m "fix: support GitHub Pages subpath"
```

---

### Task 2: Pages deployment workflow and live link

**Files:**
- Modify: `web/tests/pagesDeployment.test.ts`
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: Successful `CI` workflow runs on `master` and `web/dist`.
- Produces: A serialized GitHub Pages deployment and a repository link to the live app.

- [ ] **Step 1: Extend the failing contract test**

Add:

```ts
it("deploys only successful master CI runs with official Pages actions", () => {
  const workflow = read("../.github/workflows/pages.yml");
  expect(workflow).toContain("workflow_run:");
  expect(workflow).toContain("workflows: [CI]");
  expect(workflow).toContain("branches: [master]");
  expect(workflow).toContain('github.event.workflow_run.conclusion == \'success\'');
  expect(workflow).toContain("actions/upload-pages-artifact@v3");
  expect(workflow).toContain("actions/deploy-pages@v4");
});
```

- [ ] **Step 2: Run the test and verify it fails because the workflow is absent**

Run:

```bash
cd web
npm test -- tests/pagesDeployment.test.ts
```

Expected: FAIL reading `.github/workflows/pages.yml`.

- [ ] **Step 3: Add the Pages workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy Pages

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [master]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: web/package-lock.json
      - uses: actions/configure-pages@v5
        with:
          enablement: true
      - run: npm ci
        working-directory: web
      - run: npm run build
        working-directory: web
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Add the live application link**

Add directly beneath the README introduction:

```md
**Live application:** [lastch1ld.github.io/debtrank-globe](https://lastch1ld.github.io/debtrank-globe/)
```

- [ ] **Step 5: Run full local verification**

```bash
cd web
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the deployment slice**

```bash
git add .github/workflows/pages.yml README.md web/tests/pagesDeployment.test.ts
git commit -m "ci: deploy web app to GitHub Pages"
```

- [ ] **Step 7: Publish and verify**

Push `feature/github-pages`, open a draft PR against `master`, verify CI, merge after approval, then confirm:

```text
https://lastch1ld.github.io/debtrank-globe/
https://lastch1ld.github.io/debtrank-globe/data/network/2025.json
```

Expected: the app URL returns HTML and the data URL returns the 2025 snapshot.
