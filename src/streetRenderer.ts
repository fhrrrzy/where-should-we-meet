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
const REF_ZOOM = 16;

type ProjectedShape = {
  points: [number, number][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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
    networkCache: Network | null = null,
    canvasSizeKey = "";
  let refOrigin = L.point(0, 0),
    shapes: ProjectedShape[] = [],
    visible = new Set<number>();
  let base = new Path2D();
  let resultCache: SearchResult | null = null;
  let methodCache = "",
    stageCache = -1,
    runningCache = false;
  let events: { index: number; owner: number; at: number }[] = [];
  let cursor = 0,
    previousRadius = -1;

  const trace = (target: CanvasRenderingContext2D | Path2D, index: number) => {
    shapes[index].points.forEach(([x, y], j) => {
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
      zoom = map.getZoom(),
      scale = map.getZoomScale(zoom, REF_ZOOM);
    const networkChanged = networkCache !== network;
    if (networkChanged) {
      networkCache = network;
      const sourceShapes =
        network.shapes ??
        network.edges.map(([u, v]) => [network.nodes[u], network.nodes[v]]);
      const firstNode = network.nodes[0] ?? sourceShapes[0]?.[0] ?? [0, 0];
      refOrigin = map.project(L.latLng(firstNode[0], firstNode[1]), REF_ZOOM);
      shapes = sourceShapes.map((shape) => {
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        const points = shape.map(([lat, lng]) => {
          const point = map.project([lat, lng], REF_ZOOM).subtract(refOrigin);
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
          return [point.x, point.y] as [number, number];
        });
        return { points, minX, maxX, minY, maxY };
      });
    }
    const pixelOrigin = map.getPixelOrigin(),
      topLeft = map
        .containerPointToLayerPoint(size.multiplyBy(-PADDING))
        .round(),
      paddedBounds = map.getPixelBounds().pad(PADDING),
      boundsMin = paddedBounds.min!,
      boundsMax = paddedBounds.max!,
      minX = boundsMin.x / scale - refOrigin.x,
      maxX = boundsMax.x / scale - refOrigin.x,
      minY = boundsMin.y / scale - refOrigin.y,
      maxY = boundsMax.y / scale - refOrigin.y,
      key = `${zoom},${pixelOrigin.x},${pixelOrigin.y},${topLeft.x},${topLeft.y},${size.x},${size.y},${ratio}`;
    const viewChanged = key !== viewKey || networkChanged;
    if (viewChanged) {
      const sizeKey = `${width},${height},${ratio}`;
      if (canvasSizeKey !== sizeKey) {
        for (const c of [canvas, front]) {
          c.width = Math.round(width * ratio);
          c.height = Math.round(height * ratio);
          c.style.width = `${width}px`;
          c.style.height = `${height}px`;
        }
        canvasSizeKey = sizeKey;
      }
      for (const c of [canvas, front]) L.DomUtil.setPosition(c, topLeft);
      visible = new Set();
      base = new Path2D();
      shapes.forEach((shape, index) => {
        if (
          shape.maxX < minX ||
          shape.minX > maxX ||
          shape.maxY < minY ||
          shape.minY > maxY
        )
          return;
        visible.add(index);
        trace(base, index);
      });
      viewKey = key;
    }
    const worldOrigin = pixelOrigin.add(topLeft);
    const transform = [
      ratio * scale,
      0,
      0,
      ratio * scale,
      ratio * (scale * refOrigin.x - worldOrigin.x),
      ratio * (scale * refOrigin.y - worldOrigin.y),
    ] as const;
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
    if (reset) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    tip.setTransform(1, 0, 0, 1, 0, 0);
    tip.clearRect(0, 0, front.width, front.height);
    ctx.setTransform(...transform);
    tip.setTransform(...transform);
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    const lineScale = Math.max(0.7, Math.min(2.5, 2 ** ((zoom - 12) * 0.5)));
    if (reset) {
      cursor = 0;
      ctx.strokeStyle = "#32413d";
      ctx.globalAlpha = 0.64;
      ctx.lineWidth = (0.65 * lineScale) / scale;
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
      ctx.lineWidth = lineScale / scale;
      ctx.stroke();
      if (running && !reset) {
        tip.beginPath();
        indices.forEach((index) => trace(tip, index));
        tip.strokeStyle = "#ecfff4";
        tip.globalAlpha = 0.85;
        tip.lineWidth = (1.3 * lineScale) / scale;
        tip.stroke();
      }
    });
    if (result && !running && reset) {
      result.pathEdges.forEach((path, i) => {
        for (const glow of [true, false]) {
          ctx.beginPath();
          path.forEach((index) => trace(ctx, index));
          ctx.strokeStyle = friendColor(friends[i]);
          ctx.lineWidth = (glow ? 11 : 3) / scale;
          ctx.globalAlpha = glow ? 0.16 : 1;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke();
        }
      });
    }
  };

  return { draw };
}
