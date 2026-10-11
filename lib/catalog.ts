export const CATEGORIES = [
  ["home", "Hem & möbler"],
  ["tools", "Verktyg"],
  ["garden", "Trädgård"],
  ["electronics", "Elektronik"],
  ["sport", "Sport & fritid"],
  ["children", "Barn"],
  ["clothes", "Kläder & accessoarer"],
  ["vehicles", "Fordonstillbehör"],
  ["hobby", "Hobby & samlarobjekt"],
  ["other", "Övrigt"],
] as const;
export const CONDITIONS = [
  ["new", "Ny/oanvänd"],
  ["excellent", "Mycket bra"],
  ["good", "Bra"],
  ["used", "Använt"],
  ["worn", "Slitet men fungerande"],
] as const;
export const RADII = [5, 15, 50] as const;
// Area centres only. No address/GPS input is collected or persisted.
export const CITIES = [
  ["Norrtälje", 59.76, 18.7],
  ["Rimbo", 59.74, 18.37],
  ["Bergshamra", 59.64, 18.63],
  ["Hallstavik", 60.05, 18.6],
  ["Älmsta", 59.97, 18.81],
  ["Roslagsbro", 59.85, 18.76],
  ["Rådmansö", 59.75, 18.99],
  ["Stockholm", 59.33, 18.07],
  ["Solna", 59.36, 18.0],
  ["Sundbyberg", 59.36, 17.97],
  ["Täby", 59.44, 18.07],
  ["Vallentuna", 59.53, 18.08],
  ["Åkersberga", 59.48, 18.3],
  ["Uppsala", 59.86, 17.64],
  ["Knivsta", 59.73, 17.79],
  ["Sigtuna", 59.62, 17.72],
  ["Märsta", 59.62, 17.86],
  ["Östhammar", 60.26, 18.37],
  ["Göteborg", 57.71, 11.97],
  ["Malmö", 55.61, 13.0],
] as const;
export function area(city: string) {
  const c = CITIES.find((c) => c[0] === city);
  if (!c) throw new Error("Välj en ort i listan.");
  return { city: c[0], lat: c[1], lng: c[2] };
}
export const REASONS = [
  "Misstänkt stöldgods",
  "Bedrägeri",
  "Förbjuden vara",
  "Felaktig beskrivning",
  "Trakasserier",
  "Spam",
  "Annat",
] as const;
export const PROHIBITED = [
  "Illegala varor",
  "Stöldgods",
  "Vapen och ammunition",
  "Narkotika",
  "Receptbelagda läkemedel",
  "Farliga kemikalier",
  "Förfalskade varor",
] as const;
export const STATUS: Record<string, string> = {
  active: "Aktiv",
  reserved: "Byte överenskommet",
  traded: "Bytt",
  paused: "Pausad",
  deleted: "Borttagen",
  pending: "Väntar på svar",
  countered: "Ersatt av motbud",
  accepted: "Byte överenskommet",
  declined: "Avböjt",
  cancelled: "Avbrutet",
  completed: "Genomfört",
};
export const categoryName = (id: string) =>
  CATEGORIES.find((c) => c[0] === id)?.[1] || id;
export const conditionName = (id: string) =>
  CONDITIONS.find((c) => c[0] === id)?.[1] || id;
export function normalize(s: string) {
  return s
    .toLocaleLowerCase("sv")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .trim();
}
export function distance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = Math.PI / 180;
  const dlat = (b.lat - a.lat) * r,
    dlng = (b.lng - a.lng) * r;
  const x =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function barterText(s: string) {
  return !/(?:\b(?:swish|sek|eur|usd|kronor|pengar|kontant(?:er|bud)?|mellanskillnad|pris(?:et|er)?|marknadsvärde|värdering|säljes|säljer|sälja|köpes|köper|köpa|betalning|betala|cash|spänn)\b|\d\s*(?:kr\b|[€$£]|:\s*-)|[€$£])/iu.test(
    s,
  );
}
