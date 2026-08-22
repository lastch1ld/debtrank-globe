/**
 * Cross-border financial centres: jurisdictions whose external assets and
 * liabilities are exceptionally large relative to their domestic economy
 * because they host banking activity booked on behalf of the rest of the
 * world, not because of local economic size. BIS itself treats these as a
 * distinct reporting category for exactly this reason.
 *
 * List merged from:
 * - BIS locational banking statistics reporting jurisdictions flagged as
 *   cross-border centres: BH, BM, BS, CW, CY, GG, HK, IE, IM, JE, KY, LU,
 *   NL, PA, SG.
 * - BIS Quarterly Review, June 2022, "The outsize role of cross-border
 *   financial centres" (Aldasoro, Ehlers, Eren) core/occasional set, which
 *   adds VG, GI, MT, MU, LR, MH.
 *
 * Macao SAR (MO) is included alongside Hong Kong SAR for the same reason
 * BIS treats HK as a centre: gaming/finance-driven cross-border banking
 * claims that dwarf its domestic GDP.
 *
 * This list drives an optional display filter only -- it does not change
 * the underlying exposure network or DebtRank/Eisenberg-Noe computation,
 * which still needs these nodes to correctly model contagion paths that
 * route through them.
 */
export const FINANCIAL_CENTER_IDS: ReadonlySet<string> = new Set([
  "BHR", // Bahrain
  "BMU", // Bermuda
  "BHS", // Bahamas
  "CUW", // Curaçao
  "CYP", // Cyprus
  "GGY", // Guernsey
  "GIB", // Gibraltar
  "HKG", // Hong Kong SAR, China
  "IRL", // Ireland
  "IMN", // Isle of Man
  "JEY", // Jersey
  "CYM", // Cayman Islands
  "LBR", // Liberia
  "LUX", // Luxembourg
  "MHL", // Marshall Islands
  "MLT", // Malta
  "MUS", // Mauritius
  "MAC", // Macao SAR, China
  "NLD", // Netherlands
  "PAN", // Panama
  "SGP", // Singapore
  "VGB", // British Virgin Islands
]);

export function isFinancialCenter(countryId: string): boolean {
  return FINANCIAL_CENTER_IDS.has(countryId);
}
