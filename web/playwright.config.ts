import { defineConfig } from "@playwright/test";

// Runs against the production build served under the Pages base path, so
// base-path bugs surface here (run via `npm run e2e`, which builds first). PW_CHROMIUM_PATH lets a machine whose cached
// Chromium revision differs from this Playwright's point at one it has.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts", // not *.spec.ts: vitest would pick those up
  fullyParallel: true,
  // Each page software-renders a WebGL globe; several at once starve the CPU and time out.
  workers: process.env.CI ? 2 : 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173/debtrank-globe/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "npx vite preview --base /debtrank-globe/ --port 4173 --strictPort",
    url: "http://localhost:4173/debtrank-globe/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
