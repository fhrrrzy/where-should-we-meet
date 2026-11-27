export type Network = {
  nodes: number[][];
  edges: number[][];
  shapes?: number[][][];
  source: string;
  bounds: number[];
};
export type SearchResult = {
  meeting: number;
  sources: number[];
  distances: Float64Array[];
  paths: number[][];
  pathEdges: number[][];
  trips: number[];
  explored: number;
  maxDistance: number;
  arrivals: number[];
  perSourceArrivals: number[][];
};
export function distance(a: number[], b: number[]) {
  const r = Math.PI / 180;
  const x = (b[1] - a[1]) * r * Math.cos(((a[0] + b[0]) * r) / 2);
  const y = (b[0] - a[0]) * r;
  return Math.hypot(x, y) * 6371;
}
export function nearestNode(nodes: number[][], point: number[]) {
  let best = 0,
    score = Infinity;
  nodes.forEach((n, i) => {
    const d = distance(n, point);
    if (d < score) {
      score = d;
      best = i;
    }
  });
  return best;
}
class Heap {
  data: [number, number][] = [];
  push(node: number, cost: number) {
    const a = this.data;
    let i = a.length;
    a.push([node, cost]);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][1] <= cost) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = [node, cost];
  }
  pop() {
    const a = this.data,
      top = a[0],
      last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1;
        if (c + 1 < a.length && a[c + 1][1] < a[c][1]) c++;
        if (a[c][1] >= last[1]) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return top;
  }
}
export function solveNetwork(
  network: Network,
  points: number[][],
  objective: "balanced" | "total",
): SearchResult {
  const { nodes, edges } = network;
  const adjacency: [number, number, number][][] = Array.from(
    { length: nodes.length },
    () => [],
  );
  edges.forEach(([u, v, weight], i) => {
    const d = weight ?? distance(nodes[u], nodes[v]);
    adjacency[u].push([v, d, i]);
    adjacency[v].push([u, d, i]);
  });
  const sources = points.map((p) => nearestNode(nodes, p));
  const searches = sources.map((source) => {
    const dist = new Float64Array(nodes.length).fill(Infinity),
      prev = new Int32Array(nodes.length).fill(-1),
      prevEdge = new Int32Array(nodes.length).fill(-1),
      q = new Heap();
    dist[source] = 0;
    q.push(source, 0);
    while (q.data.length) {
      const [u, cost] = q.pop();
      if (cost > dist[u]) continue;
      for (const [v, w, edge] of adjacency[u]) {
        const next = cost + w;
        if (next < dist[v]) {
          dist[v] = next;
          prev[v] = u;
          prevEdge[v] = edge;
          q.push(v, next);
        }
      }
    }
    return { dist, prev, prevEdge };
  });
  let meeting = -1,
    best = Infinity,
    tie = Infinity;
  nodes.forEach((_, i) => {
    const ds = searches.map((s) => s.dist[i]);
    if (ds.some((d) => !Number.isFinite(d))) return;
    const sum = ds.reduce((a, b) => a + b, 0),
      max = Math.max(...ds);
    const score = objective === "balanced" ? max : sum,
      secondary = objective === "balanced" ? sum : max;
    if (
      score < best - 1e-8 ||
      (Math.abs(score - best) < 1e-8 && secondary < tie)
    ) {
      meeting = i;
      best = score;
      tie = secondary;
    }
  });
  if (meeting < 0)
    throw new Error(
      "These starting points are not connected. Try nearby streets.",
    );
  const trips = searches.map((s) => s.dist[meeting]);
  const paths = searches.map((s) => {
    const path: number[] = [];
    for (let n = meeting; n !== -1; n = s.prev[n]) path.push(n);
    return path.reverse();
  });
  const pathEdges = searches.map((s) => {
    const path: number[] = [];
    for (let n = meeting; s.prev[n] !== -1; n = s.prev[n])
      path.push(s.prevEdge[n]);
    return path.reverse();
  });
  const maxDistance = Math.max(...trips);
  const perSourceArrivals = searches.map((s) =>
    edges.map(([u, v]) => Math.min(s.dist[u], s.dist[v])).sort((a, b) => a - b),
  );
  const arrivals = edges
    .map(([u, v]) =>
      Math.min(...searches.map((s) => Math.min(s.dist[u], s.dist[v]))),
    )
    .sort((a, b) => a - b);
  const explored = arrivals.filter((d) => d <= maxDistance).length;
  return {
    meeting,
    sources,
    distances: searches.map((s) => s.dist),
    paths,
    pathEdges,
    trips,
    explored,
    maxDistance,
    arrivals,
    perSourceArrivals,
  };
}
