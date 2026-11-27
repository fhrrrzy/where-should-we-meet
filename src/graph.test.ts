import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { solveNetwork, nearestNode, type Network } from "./graph.ts";
const network: Network = {
  nodes: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
  ],
  source: "test",
  bounds: [],
};
describe("street-network meeting points", () => {
  it("balances the longest trip, reconstructing connected shortest paths", () => {
    const r = solveNetwork(
      network,
      [
        [0, 0],
        [0, 4],
      ],
      "balanced",
    );
    assert.equal(r.meeting, 2);
    assert.deepEqual(r.paths, [
      [0, 1, 2],
      [4, 3, 2],
    ]);
    assert.ok(Math.abs(r.trips[0] - r.trips[1]) < 1e-8);
  });
  it("uses a different optimum for total distance and handles identical starts", () => {
    const points = [
      [0, 0],
      [0, 0],
      [0, 4],
    ];
    assert.equal(solveNetwork(network, points, "balanced").meeting, 2);
    assert.equal(solveNetwork(network, points, "total").meeting, 0);
    assert.deepEqual(
      solveNetwork(
        network,
        [
          [0, 1],
          [0, 1],
        ],
        "balanced",
      ).trips,
      [0, 0],
    );
  });
  it("snaps arbitrary map points to streets and rejects disconnected starts", () => {
    assert.equal(nearestNode(network.nodes, [0, 1.1]), 1);
    assert.throws(
      () =>
        solveNetwork(
          {
            ...network,
            edges: [
              [0, 1],
              [3, 4],
            ],
          },
          [
            [0, 0],
            [0, 4],
          ],
          "balanced",
        ),
      /not connected/,
    );
  });
});
