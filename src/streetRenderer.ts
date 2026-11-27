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

const PADDING = 0.3;
const MAX_CACHED_ZOOMS = 3;

/** Paint each reached street once, rather than repainting the graph every frame. */
export function createStreetRenderer(
  map: L.Map,
  canvas: HTMLCanvasElement,
  scene: () => Scene,
) {
  const front = L.DomUtil.create(
    "canvas",
    "street-canvas leaflet-zoom-animated",
    map.getPane("overlayPane")!,
  );
  L.DomUtil.addClass(canvas, "leaflet-zoom-animated");
  const ctx = canvas.getContext("2d")!;
  const tip = front.getContext("2d")!;
  let viewKey = "",
    networkCache: Network | null = null,
    projectedByZoom = new Map<number, number[][][]>();
  let shapes: number[][][] = [],
    visible = new Set<number>();
  let base = new Path2D(),
    drawnCenter = map.getCenter(),
    drawnZoom = map.getZoom();
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

  const draw = () => {
    const { network, result, progress, running, method, friends } = scene();
    if (!network) return;
    const size = map.getSize(),
      width = size.x * (1 + 2 * PADDING),
      height = size.y * (1 + 2 * PADDING),
      ratio = Math.min(window.devicePixelRatio || 1, 2),
      zoom = map.getZoom();
    const networkChanged = networkCache !== network;
    if (networkChanged) {
      projectedByZoom.clear();
      networkCache = network;
    }
    let projected = projectedByZoom.get(zoom);
    if (projected) {
      projectedByZoom.delete(zoom);
      projectedByZoom.set(zoom, projected);
    } else {
      const project = ([lat, lng]: number[]) => {
        const point = map.project([lat, lng], zoom);
        return [point.x, point.y];
      };
      projected = (
        network.shapes ??
        network.edges.map(([u, v]) => [network.nodes[u], network.nodes[v]])
      ).map((shape) => shape.map(project));
      projectedByZoom.set(zoom, projected);
      if (projectedByZoom.size > MAX_CACHED_ZOOMS) {
        const oldestZoom = projectedByZoom.keys().next().value;
        if (oldestZoom !== undefined) projectedByZoom.delete(oldestZoom);
      }
    }
    shapes = projected;
    const pixelOrigin = map.getPixelOrigin(),
      topLeft = map
        .containerPointToLayerPoint(size.multiplyBy(-PADDING))
        .round(),
      paddedBounds = map.getPixelBounds().pad(PADDING),
      boundsMin = paddedBounds.min!,
      boundsMax = paddedBounds.max!,
      key = `${zoom},${pixelOrigin.x},${pixelOrigin.y},${topLeft.x},${topLeft.y},${size.x},${size.y},${ratio}`;
    const viewChanged = key !== viewKey || networkChanged;
    if (viewChanged) {
      for (const c of [canvas, front]) {
        L.DomUtil.setPosition(c, topLeft);
        c.width = Math.round(width * ratio);
        c.height = Math.round(height * ratio);
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;
      }
      visible = new Set();
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
          east < boundsMin.x ||
          west > boundsMax.x ||
          south < boundsMin.y ||
          north > boundsMax.y
        )
          return;
        visible.add(index);
        trace(base, index);
      });
      viewKey = key;
      drawnCenter = map.getCenter();
      drawnZoom = zoom;
    }
    const worldOrigin = pixelOrigin.add(topLeft);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    tip.setTransform(ratio, 0, 0, ratio, 0, 0);
    const stage =
      method === "sequential"
        ? Math.min(friends.length - 1, Math.floor(progress * friends.length))
        : 0;
    const radius = result
      ? result.maxDistance *
        (method === "sequential" ? progress * friends.length - stage : progress)
      : 0;
    const sceneChanged =
      networkChanged ||
      resultCache !== result ||
      methodCache !== method ||
      stageCache !== stage ||
      runningCache !== running;
    const reset = viewChanged || sceneChanged || radius < previousRadius;
    if (sceneChanged) {
      events =
        result && result.maxDistance > 0.001
          ? network.edges
              .map(([u, v], index) => {
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
      resultCache = result;
      methodCache = method;
      stageCache = stage;
      runningCache = running;
    }
    if (reset) ctx.clearRect(0, 0, width, height);
    tip.clearRect(0, 0, width, height);
    ctx.translate(-worldOrigin.x, -worldOrigin.y);
    tip.translate(-worldOrigin.x, -worldOrigin.y);
    const lineScale = Math.max(0.7, Math.min(2.5, 2 ** ((zoom - 12) * 0.5)));
    if (reset) {
      cursor = 0;
      ctx.strokeStyle = "#32413d";
      ctx.globalAlpha = 0.64;
      ctx.lineWidth = 0.65 * lineScale;
      ctx.stroke(base);
    }
    previousRadius = radius;
    const buckets: number[][] = colors.map(() => []);
    const until = running ? radius : (result?.maxDistance ?? 0);
    while (cursor < events.length && events[cursor].at <= until) {
      const event = events[cursor++];
      if (visible.has(event.index)) buckets[event.owner].push(event.index);
    }
    buckets.forEach((indices, i) => {
      if (!indices.length) return;
      ctx.beginPath();
      indices.forEach((index) => trace(ctx, index));
      ctx.strokeStyle = friendColor(friends[i]);
      ctx.globalAlpha = running ? 0.85 : 0.42;
      ctx.lineWidth = lineScale;
      ctx.stroke();
      if (running && !reset) {
        tip.beginPath();
        indices.forEach((index) => trace(tip, index));
        tip.strokeStyle = "#ecfff4";
        tip.globalAlpha = 0.85;
        tip.lineWidth = 1.3 * lineScale;
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

  const transform = (center: L.LatLng, zoom: number) => {
    const scale = map.getZoomScale(zoom, drawnZoom);
    const viewHalf = map.getSize().multiplyBy(0.5 + PADDING);
    const offset = viewHalf
      .multiplyBy(-scale)
      .add(map.project(drawnCenter, zoom))
      .subtract((map as any)._getNewPixelOrigin(center, zoom));
    for (const c of [canvas, front]) L.DomUtil.setTransform(c, offset, scale);
  };

  return { draw, transform };
}
