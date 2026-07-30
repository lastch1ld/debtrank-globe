import bondYields from "../data/bond_yields.json";

type BondYieldData = Record<string, Record<string, number>>;

const data = bondYields as BondYieldData;

/** 10-year government bond yield (%) for a country/year, from FRED's OECD
 * long-term interest rate series. Returns null when that country isn't
 * covered by the series (mostly non-OECD economies) or has no value for
 * that specific year. */
export function getBondYield(countryId: string, year: number): number | null {
  return data[countryId]?.[String(year)] ?? null;
}

/** Spread (in percentage points) vs. US Treasuries for the same year, the
 * closest thing to a universal "market-implied risk premium" this series
 * supports. Null if either side is unavailable. */
export function getBondSpreadVsUS(countryId: string, year: number): number | null {
  const own = getBondYield(countryId, year);
  const us = getBondYield("USA", year);
  if (own === null || us === null) return null;
  return own - us;
}
