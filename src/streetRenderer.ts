import L from "leaflet";
import { colors, friendColor, type Friend } from "./places";
import type { Network, SearchResult } from "./graph";

type Scene = {
  network: Network | null;
  result: SearchResult | null;
  progress: number;
  running: boolean;
  method: "together" | "sequential";
  friends: Friend[];
};

/** Paint each reached street once, rather than repainting the graph every frame. */
export function createStreetRenderer(
  map: L.Map,
  canvas: HTMLCanvasElement,
  scene: () => Scene,
) {
  const front = L.DomUtil.create(
    "canvas",
    "street-canvas",
    map.getPane("overlayPane")!,
  );
  const ctx = canvas.getContext("2d")!;
  const tip = front.getContext("2d")!;
  let viewKey = "",
    networkCache: Network | null = null;
  let shapes: number[][][] = [],
    visible: number[] = [];
  let base = new Path2D();
  let resultCache: SearchResult | null = null;
  let methodCache = "",
    stageCache = -1,
    runningCache = false;
  let events: { index: number; owner: number; at: number }[] = [];
  let cursor = 0,
    previousRadius = -1;

  const trace = (target: CanvasRenderingContext2D | Path2D, index: number) => {
    shapes[index].forEach(([x, y], j) => {
      if (j === 0) target.moveTo(x, y);
      else target.lineTo(x, y);
    });
  };

  return () => {
    const { network, result, progress, running, method, friends } = scene();
    if (!network) return;
    const size = map.getSize(),
      ratio = Math.min(window.devicePixelRatio || 1, 2);
    const origin = map.getPixelOrigin(),
      topLeft = map.containerPointToLayerPoint([0, 0]);
    const key = `${map.getZoom()},${origin.x},${origin.y},${topLeft.x},${topLeft.y},${size.x},${size.y},${ratio}`;
    const viewChanged = key !== viewKey || networkCache !== network;
    if (viewChanged) {
      for (const c of [canvas, front]) {
        L.DomUtil.setPosition(c, topLeft);
        c.width = Math.round(size.x * ratio);
        c.height = Math.round(size.y * ratio);
        c.style.width = `${size.x}px`;
        c.style.height = `${size.y}px`;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      tip.setTransform(ratio, 0, 0, ratio, 0, 0);
      const scale = map.options.crs!.scale(map.getZoom());
      const project = ([lat, lng]: number[]) => {
        const sin = Math.sin((lat * Math.PI) / 180);
        return [
          (lng / 360 + 0.5) * scale - origin.x - topLeft.x,
          (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale -
            origin.y -
            topLeft.y,
        ];
      };
      shapes = (
        network.shapes ??
        network.edges.map(([u, v]) => [network.nodes[u], network.nodes[v]])
      ).map((shape) => shape.map(project));
      visible = [];
      base = new Path2D();
      shapes.forEach((shape, index) => {
        let west = Infinity,
          east = -Infinity,
          north = Infinity,
          south = -Infinity;
        for (const [x, y] of shape) {
          west = Math.min(west, x);
          east = Math.max(east, x);
          north = Math.min(north, y);
          south = Math.max(south, y);
        }
        if (
          east < -20 ||
          west > size.x + 20 ||
          south < -20 ||
          north > size.y + 20
        )
          return;
        visible.push(index);
        trace(base, index);
      });
      viewKey = key;
      networkCache = network;
    }
    const stage =
      method === "sequential"
        ? Math.min(friends.length - 1, Math.floor(progress * friends.length))
        : 0;
    const radius = result
      ? result.maxDistance *
        (method === "sequential" ? progress * friends.length - stage : progress)
      : 0;
    const reset =
      viewChanged ||
      resultCache !== result ||
      methodCache !== method ||
      stageCache !== stage ||
      runningCache !== running ||
      radius < previousRadius;
    if (reset) {
      ctx.clearRect(0, 0, size.x, size.y);
      ctx.strokeStyle = "#32413d";
      ctx.globalAlpha = 0.64;
      ctx.lineWidth = 0.65;
      ctx.stroke(base);
      events =
        result && result.maxDistance > 0.001
          ? visible
              .map((index) => {
                const [u, v] = network.edges[index];
                let owner = 0,
                  at = Infinity;
                result.distances.forEach((distances, i) => {
                  const d = Math.min(distances[u], distances[v]);
                  if (d < at) {
                    owner = i;
                    at = d;
                  }
                });
                if (method === "sequential" && running) {
                  owner = stage;
                  at = Math.min(
                    result.distances[stage][u],
                    result.distances[stage][v],
                  );
                }
                return { index, owner, at };
              })
              .sort((a, b) => a.at - b.at)
          : [];
      cursor = 0;
      resultCache = result;
      methodCache = method;
      stageCache = stage;
      runningCache = running;
    }
    previousRadius = radius;
    tip.clearRect(0, 0, size.x, size.y);
    const buckets: number[][] = colors.map(() => []);
    const until = running ? radius : (result?.maxDistance ?? 0);
    while (cursor < events.length && events[cursor].at <= until) {
      const event = events[cursor++];
      buckets[event.owner].push(event.index);
    }
    buckets.forEach((indices, i) => {
      if (!indices.length) return;
      ctx.beginPath();
      indices.forEach((index) => trace(ctx, index));
      ctx.strokeStyle = friendColor(friends[i]);
      ctx.globalAlpha = running ? 0.85 : 0.42;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (running && !reset) {
        tip.beginPath();
        indices.forEach((index) => trace(tip, index));
        tip.strokeStyle = "#ecfff4";
        tip.globalAlpha = 0.85;
        tip.lineWidth = 1.3;
        tip.stroke();
      }
    });
    if (result && !running && reset) {
      result.pathEdges.forEach((path, i) => {
        for (const glow of [true, false]) {
          ctx.beginPath();
          path.forEach((index) => trace(ctx, index));
          ctx.strokeStyle = friendColor(friends[i]);
          ctx.lineWidth = glow ? 11 : 3;
          ctx.globalAlpha = glow ? 0.16 : 1;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
        }
      });
    }
  };
}
