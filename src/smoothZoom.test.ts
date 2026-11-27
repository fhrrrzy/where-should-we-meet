import { it } from "node:test";
import assert from "node:assert/strict";
import { easeZoom, wheelZoomDelta } from "./smoothZoom.ts";

it("converts mouse, trackpad, and pinch wheel deltas", () => {
  assert.equal(
    wheelZoomDelta({ deltaY: 100, deltaMode: 0, ctrlKey: false }),
    -0.5,
  );
  assert.equal(
    wheelZoomDelta({ deltaY: -10, deltaMode: 0, ctrlKey: true }),
    0.12,
  );
  assert.equal(
    wheelZoomDelta({ deltaY: 3, deltaMode: 1, ctrlKey: false }),
    -0.3,
  );
});

it("clamps wheel zoom deltas to one level", () => {
  assert.equal(
    wheelZoomDelta({ deltaY: -1000, deltaMode: 0, ctrlKey: false }),
    1,
  );
  assert.equal(
    wheelZoomDelta({ deltaY: 1000, deltaMode: 0, ctrlKey: false }),
    -1,
  );
});

it("eases toward either target without overshooting", () => {
  const inProgress = easeZoom(1, 2, 16);
  assert.ok(inProgress > 1 && inProgress < 2);
  const outProgress = easeZoom(2, 1, 16);
  assert.ok(outProgress < 2 && outProgress > 1);
});

it("does not move at zero elapsed time and snaps close results to target", () => {
  assert.equal(easeZoom(1, 2, 0), 1);
  assert.equal(easeZoom(1, 2, 1000), 2);
  assert.equal(easeZoom(1, 2, 0, 0), 1);
});
