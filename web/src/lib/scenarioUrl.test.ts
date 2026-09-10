import { afterEach, describe, expect, it, vi } from "vitest";
import { countries } from "./network";
import { parseScenarioFromUrl, writeScenarioToUrl, type Scenario } from "./scenarioUrl";

const id = countries[0].id;

function stubWindow(search: string) {
  const replaceState = vi.fn();
  vi.stubGlobal("window", {
    location: { search, pathname: "/debtrank-globe/", href: "" },
    history: { replaceState },
  });
  return replaceState;
}

afterEach(() => vi.unstubAllGlobals());

const base: Scenario = { year: 2020, shockId: id, magnitude: 0.5, model: "debtrank", includePortfolio: false };

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
});
