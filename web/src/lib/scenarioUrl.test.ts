import { afterEach, describe, expect, it, vi } from "vitest";
import { countries } from "./network";
import {
  clearScenarioFromUrl,
  fullAppUrl,
  isEmbedded,
  parseScenarioFromUrl,
  parseViewFromUrl,
  writeScenarioToUrl,
  writeViewToUrl,
  type Scenario,
} from "./scenarioUrl";

const id = countries[0].id;
const other = countries[1].id;

function stubWindow(search: string) {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { search, pathname: "/debtrank-globe/", href: `https://x.test/debtrank-globe/${search}` },
    history: { replaceState },
  });
  return replaceState;
}

afterEach(() => vi.unstubAllGlobals());

const base: Scenario = {
  year: 2020,
  shocks: [{ id, magnitude: 0.5, delay: 0 }],
  model: "debtrank",
  includePortfolio: false,
};

describe("scenario round-trip", () => {
  it("carries the portfolio layer through a link", () => {
    const replaceState = stubWindow("");
    writeScenarioToUrl({ ...base, includePortfolio: true });
    const written = String(replaceState.mock.calls[0][2]);
    expect(written).toContain("portfolio=1");

    stubWindow(written.slice(written.indexOf("?")));
    expect(parseScenarioFromUrl()).toEqual({ ...base, includePortfolio: true });
  });

  it("leaves the parameter out when the layer is off", () => {
    const replaceState = stubWindow("");
    writeScenarioToUrl(base);
    expect(String(replaceState.mock.calls[0][2])).not.toContain("portfolio");
  });

  it("still reads links shared before the parameter existed", () => {
    stubWindow(`?year=2020&shock=${id}&magnitude=0.50&model=debtrank`);
    expect(parseScenarioFromUrl()).toEqual(base);
  });

  it("round-trips a sequence of shocks with their arrival rounds", () => {
    const sequence: Scenario = {
      ...base,
      shocks: [
        { id, magnitude: 1, delay: 0 },
        { id: other, magnitude: 0.6, delay: 2 },
      ],
    };
    const replaceState = stubWindow("");
    writeScenarioToUrl(sequence);
    const written = String(replaceState.mock.calls[0][2]);

    stubWindow(written.slice(written.indexOf("?")));
    expect(parseScenarioFromUrl()).toEqual(sequence);
  });

  it("drops entries a hand-edited link got wrong, keeping the rest", () => {
    // Out-of-range magnitude, unknown country, duplicate, negative round.
    stubWindow(
      `?year=2020&model=debtrank&shock=${id}:0.50,ZZZ:0.40,${other}:9.00,${id}:0.30,${other}:0.40@-1`,
    );
    expect(parseScenarioFromUrl()?.shocks).toEqual([{ id, magnitude: 0.5, delay: 0 }]);
  });

  it("is null when nothing in the shock list survives validation", () => {
    stubWindow("?year=2020&model=debtrank&shock=ZZZ:0.50");
    expect(parseScenarioFromUrl()).toBeNull();
  });
});

describe("embed mode", () => {
  it("is off unless the flag is set", () => {
    stubWindow("?year=2020");
    expect(isEmbedded()).toBe(false);
  });

  it("survives a scenario rewrite", () => {
    // The flag is read once at load, so a rewrite that drops it would
    // un-embed the page on the viewer's next refresh inside the iframe.
    const replaceState = stubWindow("?embed=1");
    writeScenarioToUrl(base);
    expect(String(replaceState.mock.calls[0][2])).toContain("embed=1");
  });

  it("points its escape hatch at the same view, un-embedded", () => {
    stubWindow("?year=2020&shock=ABW&magnitude=0.50&model=debtrank&embed=1");
    const url = fullAppUrl();
    expect(url).not.toContain("embed");
    expect(url).toContain("year=2020");
    expect(url).toContain("model=debtrank");
  });
});

describe("the active view", () => {
  it("defaults to Contagion, including for every link made before tabs existed", () => {
    stubWindow("");
    expect(parseViewFromUrl()).toBe("contagion");
    stubWindow("?year=2010&shock=GRC:1.00&model=debtrank");
    expect(parseViewFromUrl()).toBe("contagion");
  });

  it("reads view=stability, and falls back on anything it doesn't know", () => {
    stubWindow("?view=stability");
    expect(parseViewFromUrl()).toBe("stability");
    stubWindow("?view=nope");
    expect(parseViewFromUrl()).toBe("contagion");
  });

  it("writes the view without touching the other parameters, and drops it for the default", () => {
    const replaceState = stubWindow("?year=2010&embed=1");
    writeViewToUrl("stability");
    expect(String(replaceState.mock.calls[0][2])).toBe("/debtrank-globe/?year=2010&embed=1&view=stability");
    const again = stubWindow("?view=stability&year=2010");
    writeViewToUrl("contagion");
    expect(String(again.mock.calls[0][2])).toBe("/debtrank-globe/?year=2010");
    const bare = stubWindow("?view=stability");
    writeViewToUrl("contagion");
    expect(String(bare.mock.calls[0][2])).toBe("/debtrank-globe/");
  });

  it("survives a scenario rewrite and a reset, so changing a toggle never bounces the viewer off their tab", () => {
    const written = stubWindow("?view=stability");
    writeScenarioToUrl(base);
    expect(String(written.mock.calls[0][2])).toContain("view=stability");
    const cleared = stubWindow("?view=stability&year=2010");
    clearScenarioFromUrl();
    expect(String(cleared.mock.calls[0][2])).toBe("/debtrank-globe/?view=stability");
  });
});
