import marketData from "../data/market_data.json";
import marketDataSource from "../data/market_data_source.json";

interface YearFields {
  bond_yield_pct?: number;
  policy_rate_pct?: number;
  stock_change_pct?: number;
}

type MarketData = Record<string, Record<string, YearFields>>;

const data = marketData as MarketData;

function field(countryId: string, year: number, key: keyof YearFields): number | null {
  return data[countryId]?.[String(year)]?.[key] ?? null;
}

/** The credit the OECD asks for when its data is shown: the dataset, where it
 * is published, and when this copy was retrieved. */
export const MARKET_DATA_CREDIT = {
  text: `OECD (${marketDataSource.retrieved.slice(0, 4)}), Financial market`,
  url: "https://data-explorer.oecd.org/",
  retrieved: marketDataSource.retrieved,
};

/** 10-year government bond yield (%), the OECD's long-term interest rate
 * series. Null when that country/year isn't covered. */
export function getBondYield(countryId: string, year: number): number | null {
  return field(countryId, year, "bond_yield_pct");
}

/** Short-term/interbank rate (%), the standard OECD proxy for national
 * policy rates. Broader coverage than the bond-yield series. */
export function getPolicyRate(countryId: string, year: number): number | null {
  return field(countryId, year, "policy_rate_pct");
}

/** Year-over-year change (%) in the country's share price index. */
export function getStockChange(countryId: string, year: number): number | null {
  return field(countryId, year, "stock_change_pct");
}

/** Bond-yield spread (percentage points) vs. US Treasuries for the same
 * year -- the closest thing to a universal "market-implied risk premium"
 * this series supports. Null if either side is unavailable. */
export function getBondSpreadVsUS(countryId: string, year: number): number | null {
  const own = getBondYield(countryId, year);
  const us = getBondYield("USA", year);
  if (own === null || us === null) return null;
  return own - us;
}
