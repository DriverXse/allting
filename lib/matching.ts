import { normalize, categoryName, distance } from "./catalog";
export type MatchItem = {
  id: string;
  title: string;
  description: string;
  category_id: string;
  wanted: string[];
  open_to_suggestions: number;
  owner_name: string;
  lat: number;
  lng: number;
  condition: string;
  created_at: string;
};
const equivalents: Record<string, string[]> = {
  cykel: ["cykel", "herrcykel", "damcykel", "mountainbike", "mtb"],
  verktyg: ["verktyg", "borrmaskin", "skruvdragare", "verktygslada", "sag"],
  camping: ["camping", "talt", "sovsack", "friluft"],
  tradgard: ["tradgard", "grasklippare", "spade", "kratta"],
};
export function textMatches(
  term: string,
  item: Pick<MatchItem, "title" | "description" | "category_id">,
) {
  const words = normalize(term).split(/\s+/).filter(Boolean),
    text = normalize(
      `${item.title} ${item.description} ${categoryName(item.category_id)}`,
    );
  return (
    words.length > 0 &&
    words.every(
      (w) =>
        text.includes(w) ||
        Object.values(equivalents).some(
          (group) =>
            group.some((x) => w.includes(x)) &&
            group.some((x) => text.includes(x)),
        ),
    )
  );
}
export function matchItem(
  item: MatchItem,
  own: MatchItem[],
  wanted: string[],
  origin: { lat: number; lng: number },
) {
  const terms = [...wanted, ...own.flatMap((x) => x.wanted)],
    hit = terms.find((t) => textMatches(t, item));
  if (!hit) return null;
  const alternatives = own.filter((x) =>
    item.wanted.some((t) => textMatches(t, x)),
  );
  const kind = alternatives.length
    ? "mutual"
    : item.open_to_suggestions
      ? "open"
      : "wanted";
  const reason =
    kind === "mutual"
      ? `Du söker ${hit.toLocaleLowerCase("sv")}. ${item.owner_name} söker saker som du har.`
      : kind === "open"
        ? `Matchar ${hit.toLocaleLowerCase("sv")} som du söker. ${item.owner_name} är öppen för förslag.`
        : `Matchar ${hit.toLocaleLowerCase("sv")} som du söker.`;
  // Relevance only: no economic data or implied equivalence.
  const rank =
    (kind === "mutual" ? 100 : kind === "open" ? 55 : 20) +
    Math.max(0, 20 - distance(origin, item)) +
    (["new", "excellent", "good", "used", "worn"].indexOf(item.condition) < 2
      ? 2
      : 0) +
    Math.max(0, 5 - (Date.now() - Date.parse(item.created_at)) / 86400000);
  return { kind, reason, alternatives: alternatives.map((x) => x.id), rank };
}
