import type { Network } from "./graph";

export function validateNetwork(value: unknown): value is Network {
  if (!value || typeof value !== "object") return false;
  const n = value as Network;
  const point = (p: unknown): p is number[] =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(Number.isFinite) &&
    Math.abs(p[0]) <= 90 &&
    Math.abs(p[1]) <= 180;
  return (
    typeof n.source === "string" &&
    Array.isArray(n.bounds) &&
    n.bounds.length === 4 &&
    n.bounds.every(Number.isFinite) &&
    Array.isArray(n.nodes) &&
    n.nodes.length > 1 &&
    n.nodes.every(point) &&
    Array.isArray(n.edges) &&
    n.edges.length > 0 &&
    n.edges.every(
      (e) =>
        Array.isArray(e) &&
        e.length === 3 &&
        e
          .slice(0, 2)
          .every((i) => Number.isInteger(i) && i >= 0 && i < n.nodes.length) &&
        Number.isFinite(e[2]) &&
        e[2] >= 0,
    ) &&
    (n.shapes === undefined ||
      (Array.isArray(n.shapes) &&
        n.shapes.length === n.edges.length &&
        n.shapes.every(
          (s) => Array.isArray(s) && s.length >= 2 && s.every(point),
        )))
  );
}

/** Reject off-network drops rather than silently routing across water or large gaps. */
export function nearStreet(
  network: Network,
  [lat, lng]: number[],
  toleranceKm = 0.35,
) {
  const xScale = 111.2 * Math.cos((lat * Math.PI) / 180),
    yScale = 111.2;
  for (let i = 0; i < network.edges.length; i++) {
    const [u, v] = network.edges[i];
    const shape = network.shapes?.[i] ?? [network.nodes[u], network.nodes[v]];
    for (let j = 1; j < shape.length; j++) {
      const a = shape[j - 1],
        b = shape[j];
      const ax = (a[1] - lng) * xScale,
        ay = (a[0] - lat) * yScale;
      const dx = (b[1] - a[1]) * xScale,
        dy = (b[0] - a[0]) * yScale;
      const t = Math.max(
        0,
        Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
      );
      if (Math.hypot(ax + t * dx, ay + t * dy) <= toleranceKm) return true;
    }
  }
  return false;
}
