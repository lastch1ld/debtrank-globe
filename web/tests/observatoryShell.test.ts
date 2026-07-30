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

  it("keeps the ranking header outside the scrolling country list", () => {
    const headerPosition = appSource.indexOf('data-testid="ranking-header"');
    const listPosition = appSource.indexOf('data-testid="ranked-results"');

    expect(headerPosition).toBeGreaterThan(-1);
    expect(listPosition).toBeGreaterThan(headerPosition);
    expect(appSource).toMatch(/data-testid="ranking-header"[^>]*shrink-0/);
    expect(appSource).toMatch(/data-testid="ranked-results"[^>]*overflow-y-auto/);
  });

  it("opens the sidebar without resizing the globe or navbar", () => {
    expect(appSource).not.toContain('panelOpen ? "right-0 sm:right-[380px]"');
    expect(appSource).not.toContain('panelOpen ? "right-4 sm:right-[396px]"');
  });
});
