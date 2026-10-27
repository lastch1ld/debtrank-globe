import { describe, expect, it } from "vitest";
import { MARKET_DATA_CREDIT, getBondSpreadVsUS, getBondYield, getPolicyRate, getStockChange } from "./marketData";

describe("market data", () => {
  it("credits the OECD, with the year and date it was retrieved", () => {
    expect(MARKET_DATA_CREDIT.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MARKET_DATA_CREDIT.text).toBe(`OECD (${MARKET_DATA_CREDIT.retrieved.slice(0, 4)}), Financial market`);
    expect(MARKET_DATA_CREDIT.url).toBe("https://data-explorer.oecd.org/");
  });

  it("reads the US December 2005 values the OECD publishes", () => {
    // 10Y yield 4.47 and interbank rate 4.16, checked against the OECD API.
    expect(getBondYield("USA", 2005)).toBe(4.47);
    expect(getPolicyRate("USA", 2005)).toBe(4.16);
    expect(getStockChange("USA", 2005)).toBeGreaterThan(0);
  });

  it("is null, never 0, for a country or year without data", () => {
    expect(getBondYield("ATA", 2010)).toBeNull();
    expect(getBondYield("USA", 1999)).toBeNull();
  });

  it("measures a spread against the US, and has none for the US itself or a gap", () => {
    expect(getBondSpreadVsUS("USA", 2005)).toBe(0);
    expect(getBondSpreadVsUS("ATA", 2005)).toBeNull();
  });
});
