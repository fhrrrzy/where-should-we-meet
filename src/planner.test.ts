import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialFriends, friendColor, friendLabel } from "./places.ts";
import {
  readPlanner,
  plannerUrl,
  searchPlaces,
  insideCoverage,
  outsideQuery,
} from "./planner.ts";
import { validateNetwork, nearStreet } from "./network.ts";

it("round trips current group, special names, colours and both modes into a fresh browser", () => {
  const friends = initialFriends();
  friends[0].name = "Rina & #🌸";
  friends.splice(1, 1);
  const planner = {
    friends,
    objective: "total" as const,
    method: "sequential" as const,
  };
  const restored = readPlanner(
    plannerUrl("https://example.com/app/", planner).search,
    null,
  );
  assert.equal(restored.objective, "total");
  assert.equal(restored.method, "sequential");
  assert.equal(restored.autoFind, true);
  assert.equal(restored.friends[0].name, friends[0].name);
  assert.equal(friendColor(restored.friends[1]), friendColor(friends[1]));
  const local = readPlanner("", JSON.stringify(planner));
  assert.equal(local.friends.length, 3);
  assert.equal(local.autoFind, false);
});
it("rejects malformed, undersized and out-of-coverage shared groups", () => {
  for (const group of [
    "garbage",
    "null",
    "[]",
    JSON.stringify(initialFriends().slice(0, 1)),
    JSON.stringify([
      { name: "A", place: { name: "Outside", lat: 0, lng: 0 } },
      ...initialFriends(),
    ]),
  ]) {
    const restored = readPlanner(`?group=${encodeURIComponent(group)}`, null);
    assert.equal(restored.invalid, true);
    assert.equal(restored.shared, false);
    assert.equal(restored.autoFind, false);
  }
});
it("normalizes spaces, supports short names and small typos, and identifies unsupported cities", () => {
  for (const [query, name] of [
    [" GBK ", "Gelora Bung Karno"],
    ["grgol", "Grogol"],
    ["Monaas", "Monas"],
    ["  Cempaka   Putih Barat ", "Cempaka Putih Barat"],
    ["Cilincing", "Cilincing"],
    ["Kalideres", "Kalideres"],
  ]) {
    assert.deepEqual(
      searchPlaces(query).map((p) => p.name),
      [name],
    );
  }
  assert.equal(outsideQuery("Bekasi"), true);
  assert.equal(searchPlaces("Bekasi").length, 0);
  assert.equal(insideCoverage(-6.1392, 106.705), true);
  assert.equal(friendLabel({ ...initialFriends()[2], name: "  " }), "Friend 3");
});
it("rejects invalid street files and sea drops while allowing actual street geometry", () => {
  for (const value of [
    null,
    {},
    { nodes: [], edges: [] },
    { nodes: [[1, 2]], source: "bad" },
  ])
    assert.equal(validateNetwork(value), false);
  const network = JSON.parse(
    readFileSync(
      new URL("../public/data/jakarta-network.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(validateNetwork(network), true);
  assert.equal(nearStreet(network, network.nodes[0]), true);
  assert.equal(nearStreet(network, [-6.085, 106.84]), false);
});
