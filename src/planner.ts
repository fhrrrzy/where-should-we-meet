import { initialFriends, places, type Friend } from "./places";

export const STORAGE_KEY = "meet-halfway:planner:v1";
export type Objective = "balanced" | "total";
export type Method = "together" | "sequential";
export type Planner = {
  friends: Friend[];
  objective: Objective;
  method: Method;
};
export const insideCoverage = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -6.38 &&
  lat <= -6.08 &&
  lng >= 106.68 &&
  lng <= 106.98;

function validGroup(raw: unknown): Friend[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 6) return null;
  if (
    !raw.every(
      (f) =>
        f &&
        typeof f.name === "string" &&
        f.name.length <= 30 &&
        typeof f.place?.name === "string" &&
        f.place.name.length <= 100 &&
        typeof f.place.lat === "number" &&
        typeof f.place.lng === "number" &&
        insideCoverage(f.place.lat, f.place.lng),
    )
  )
    return null;
  const ids = new Set<number>();
  return raw.map((f, i) => {
    const id =
      Number.isSafeInteger(f.id) &&
      f.id >= 0 &&
      f.id < 1000000 &&
      !ids.has(f.id)
        ? f.id
        : i;
    const unique = ids.has(id) ? Math.max(...ids, 0) + 1 : id;
    ids.add(unique);
    return {
      id: unique,
      name: f.name,
      place: { name: f.place.name, lat: f.place.lat, lng: f.place.lng },
      color:
        Number.isInteger(f.color) && f.color >= 0 && f.color < 6
          ? f.color
          : unique % 6,
    };
  });
}
export function readPlanner(search: string, stored: string | null) {
  const params = new URLSearchParams(search);
  const shared = params.has("group");
  let invalid = false;
  try {
    const raw = shared
      ? {
          friends: JSON.parse(params.get("group")!),
          objective: params.get("objective"),
          method: params.get("animation"),
        }
      : stored
        ? JSON.parse(stored)
        : null;
    if (raw) {
      const friends = validGroup(raw.friends);
      if (friends)
        return {
          friends,
          objective:
            raw.objective === "total"
              ? ("total" as const)
              : ("balanced" as const),
          method:
            raw.method === "sequential"
              ? ("sequential" as const)
              : ("together" as const),
          shared,
          invalid,
          autoFind: shared,
        };
      invalid = shared;
    }
  } catch {
    invalid = shared;
  }
  return {
    friends: initialFriends(),
    objective: "balanced" as Objective,
    method: "together" as Method,
    shared: false,
    invalid,
    autoFind: false,
  };
}
export function plannerUrl(href: string, planner: Planner) {
  const url = new URL(href);
  url.search = "";
  url.searchParams.set("group", JSON.stringify(planner.friends));
  url.searchParams.set("objective", planner.objective);
  url.searchParams.set("animation", planner.method);
  url.searchParams.set("run", "1");
  return url;
}
const normalize = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string[]> = {
  "Gelora Bung Karno": ["GBK", "Gelora"],
  "Grand Indonesia": ["GI"],
  "Bundaran HI": ["HI", "Hotel Indonesia"],
  Monas: ["Monumen Nasional"],
  "Central Park": ["CP"],
  "Gandaria City": ["Gancit"],
};
function editDistance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
    row = next;
  }
  return row[b.length];
}
export function searchPlaces(query: string) {
  const q = normalize(query);
  if (!q) return places;
  const labels = (name: string) =>
    [name, ...(aliases[name] ?? [])].map(normalize);
  const direct = places.filter((p) =>
    labels(p.name).some((label) => label.includes(q)),
  );
  if (direct.length) return direct;
  if (q.length < 3) return [];
  return places.filter((p) =>
    labels(p.name).some(
      (label) => editDistance(label, q) <= (q.length > 6 ? 2 : 1),
    ),
  );
}
export const outsideQuery = (query: string) =>
  ["bekasi", "depok", "tangerang", "bogor"].some((city) =>
    normalize(query).includes(city),
  );
