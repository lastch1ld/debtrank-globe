import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("observatory shell", () => {
  it("announces the active simulation state and isolates the scrolling ranking", () => {
    expect(appSource).toContain('role="status"');
    expect(appSource).toContain('aria-live="polite"');
    expect(appSource).toContain('data-testid="ranked-results"');
    expect(appSource).toMatch(/data-testid="ranked-results"[^>]*overflow-y-auto/);
  });
});
