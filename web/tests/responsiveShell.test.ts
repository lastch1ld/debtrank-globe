import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(import.meta.dirname, "../src/App.tsx"), "utf8");

describe("responsive application shell", () => {
  it("overlays the 380px desktop sidebar without resizing the globe", () => {
    expect(app).toContain('className="absolute inset-0"');
    expect(app).not.toContain("sm:right-[380px]");
    expect(app).toContain("sm:w-[380px]");
  });

  it("keeps the drawer below the mobile navbar", () => {
    expect(app).toContain("top-20");
    expect(app).toContain("sm:top-0");
  });

  it("keeps controls stable and gives ranked results their own scroll region", () => {
    expect(app).toContain('data-testid="sidebar-controls"');
    expect(app).toContain("shrink-0");
    expect(app).toContain('data-testid="ranked-results"');
    expect(app).toContain("overflow-y-auto");
  });
});
