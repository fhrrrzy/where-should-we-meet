import { it } from "node:test";
import assert from "node:assert/strict";
import { nearestSnap } from "./sheet.ts";

it("returns the index of the nearest sheet snap and keeps the first on ties", () => {
  assert.equal(nearestSnap(120, [100, 400, 800]), 0);
  assert.equal(nearestSnap(600, [100, 400, 800]), 1);
  assert.equal(nearestSnap(800, [100, 400, 800]), 2);
  assert.equal(nearestSnap(250, [100, 400, 800]), 0);
  assert.equal(nearestSnap(250, []), -1);
});
