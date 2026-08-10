/**
 * Vehicle registration marks, by where the circuit is.
 *
 * Indian plates encode the state and the RTO district, and locals read them
 * instantly — a Bengaluru street full of MH plates looks as wrong to someone
 * from there as London traffic on the right-hand side of the road. Every
 * circuit therefore stamps its own region onto the machines and the traffic.
 *
 * Series letters and numbers are deliberately generic rather than plausible
 * real registrations.
 */

export interface PlateRegion {
  /** Two-letter state code. */
  state: string;
  /** RTO district codes actually used in that city. */
  districts: readonly string[];
  /** Letter series to draw after the district. */
  series: readonly string[];
}

const REGIONS: Record<string, PlateRegion> = {
  // Karnataka. 01-05 and 41/51 are the Bengaluru RTOs.
  bengaluru: { state: 'KA', districts: ['01', '02', '03', '05', '41', '51'], series: ['HA', 'MJ', 'NB', 'CB'] },
  // Maharashtra. Thane is 04, Mumbai 01-03, Pune 12.
  thane: { state: 'MH', districts: ['04', '05', '48'], series: ['AB', 'CJ', 'DL', 'EQ'] },
  mumbai: { state: 'MH', districts: ['01', '02', '03', '43'], series: ['AJ', 'BK', 'CT', 'DN'] },
  pune: { state: 'MH', districts: ['12', '14'], series: ['AB', 'GH', 'JK', 'PQ'] },
  // Delhi RTOs use a single digit and a letter.
  delhi: { state: 'DL', districts: ['1C', '2C', '3C', '8C'], series: ['AB', 'NA', 'SR', 'TP'] },
  // Goa. 06 is Panaji, 07 Margao, 08 Mapusa.
  goa: { state: 'GA', districts: ['03', '06', '07', '08'], series: ['AB', 'CD', 'TC'] },
};

const FALLBACK: PlateRegion = REGIONS.bengaluru as PlateRegion;

export const regionFor = (city: string): PlateRegion => REGIONS[city] ?? FALLBACK;

/**
 * A short plate for a small sprite: state and district only, e.g. `KA 01`.
 * At the size these are drawn a full registration is an unreadable smudge.
 */
export const shortPlate = (city: string, variant = 0): string => {
  const region = regionFor(city);
  const district = region.districts[Math.abs(variant) % region.districts.length];
  return `${region.state} ${district}`;
};

/**
 * A full plate for anything drawn large enough to read it, e.g. `KA 01 HA 4821`.
 * The number is derived from the variant so a given vehicle keeps its identity
 * across frames rather than flickering.
 */
export const fullPlate = (city: string, variant = 0): string => {
  const region = regionFor(city);
  const v = Math.abs(variant);
  const district = region.districts[v % region.districts.length];
  const series = region.series[(v * 7) % region.series.length];
  const number = 1000 + ((v * 3137) % 9000);
  return `${region.state} ${district} ${series} ${number}`;
};
