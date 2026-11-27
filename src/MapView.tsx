import { useEffect, useRef } from "react";
import L from "leaflet";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { colors, places, type Friend } from "./places";
import type { Network, SearchResult } from "./graph";

type Props = {
  network: Network | null;
  friends: Friend[];
  result: SearchResult | null;
  progress: number;
  running: boolean;
  method: "together" | "sequential";
  active: number | null;
  onPick: (lat: number, lng: number) => void;
  onMove: (id: number, lat: number, lng: number) => void;
};
export default function MapView(props: Props) {
  const root = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    canvas = useRef<HTMLCanvasElement | null>(null),
    friendLayer = useRef<L.LayerGroup | null>(null),
    meetingLayer = useRef<L.LayerGroup | null>(null),
    latest = useRef(props);
  latest.current = props;
  const draw = useRef(() => {});
  const fit = () => {
    const mobile = window.innerWidth <= 760;
    const done = !!latest.current.result && !latest.current.running;
    if (map.current)
      map.current.fitBounds(
        L.latLngBounds(
          latest.current.friends.map(
            (f) => [f.place.lat, f.place.lng] as [number, number],
          ),
        ),
        {
          paddingTopLeft: mobile ? [45, done ? 255 : 100] : [375, 100],
          paddingBottomRight: mobile ? [45, 170] : [done ? 345 : 80, 80],
          maxZoom: 13,
          animate: false,
        },
      );
  };
  useEffect(() => {
    if (!root.current) return;
    const m = L.map(root.current, {
      center: [-6.205, 106.827],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      minZoom: 11,
      maxZoom: 16,
      maxBounds: [
        [-6.4, 106.67],
        [-6.06, 107.02],
      ],
      maxBoundsViscosity: 0.8,
    });
    map.current = m;
    L.control
      .attribution({ prefix: false, position: "bottomright" })
      .addAttribution(
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a>',
      )
      .addTo(m);
    const c = L.DomUtil.create(
      "canvas",
      "street-canvas",
      m.getPane("overlayPane")!,
    );
    canvas.current = c;
    friendLayer.current = L.layerGroup().addTo(m);
    meetingLayer.current = L.layerGroup().addTo(m);
    const labels = L.layerGroup().addTo(m);
    places
      .filter((p) =>
        [
          "Grogol",
          "Menteng",
          "Senayan",
          "Kuningan",
          "Tebet",
          "Cikini",
          "Tanah Abang",
          "Kelapa Gading",
          "Kemang",
          "Sunter",
          "Kebon Jeruk",
          "Blok M",
          "Pancoran",
        ].includes(p.name),
      )
      .forEach((p) =>
        L.marker([p.lat, p.lng], {
          interactive: false,
          icon: L.divIcon({
            className: "area-label",
            html: p.name,
            iconSize: [100, 20],
            iconAnchor: [50, 10],
          }),
        }).addTo(labels),
      );
    let cacheKey = "",
      cacheNetwork: Network | null = null,
      projectedShapes: number[][][] = [];
    let cacheResult: SearchResult | null = null,
      edgeOwners: number[] = [],
      edgeDistances: number[] = [];
    draw.current = () => {
      const { network, result, progress, running, method } = latest.current;
      if (!network) return;
      const size = m.getSize(),
        ratio = window.devicePixelRatio || 1,
        topLeft = m.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(c, topLeft);
      c.width = size.x * ratio;
      c.height = size.y * ratio;
      c.style.width = `${size.x}px`;
      c.style.height = `${size.y}px`;
      const ctx = c.getContext("2d")!;
      ctx.scale(ratio, ratio);
      const nw = m.getPixelOrigin(),
        scale = m.options.crs!.scale(m.getZoom());
      const key = `${m.getZoom()},${nw.x},${nw.y},${topLeft.x},${topLeft.y}`;
      if (key !== cacheKey || network !== cacheNetwork) {
        const project = ([lat, lng]: number[]) => {
          const sin = Math.sin((lat * Math.PI) / 180);
          return [
            (lng / 360 + 0.5) * scale - nw.x - topLeft.x,
            (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale -
              nw.y -
              topLeft.y,
          ];
        };
        projectedShapes = (
          network.shapes ??
          network.edges.map(([u, v]) => [network.nodes[u], network.nodes[v]])
        ).map((shape) => shape.map(project));
        cacheKey = key;
        cacheNetwork = network;
      }
      if (result !== cacheResult) {
        edgeOwners = [];
        edgeDistances = [];
        if (result)
          network.edges.forEach(([u, v]) => {
            let owner = 0,
              d = Infinity;
            result.distances.forEach((ds, i) => {
              const val = Math.min(ds[u], ds[v]);
              if (val < d) {
                d = val;
                owner = i;
              }
            });
            edgeOwners.push(owner);
            edgeDistances.push(d);
          });
        cacheResult = result;
      }
      const buckets: number[][] = Array.from({ length: 8 }, () => []);
      const stage =
        method === "sequential"
          ? Math.min(
              latest.current.friends.length - 1,
              Math.floor(progress * latest.current.friends.length),
            )
          : 0;
      const radius = result
        ? result.maxDistance *
          (method === "sequential"
            ? progress * latest.current.friends.length - stage
            : progress)
        : 0;
      network.edges.forEach(([u, v], index) => {
        const shape = projectedShapes[index],
          a = shape[0],
          b = shape[shape.length - 1];
        if (
          (a[0] < -30 && b[0] < -30) ||
          (a[0] > size.x + 30 && b[0] > size.x + 30) ||
          (a[1] < -30 && b[1] < -30) ||
          (a[1] > size.y + 30 && b[1] > size.y + 30)
        )
          return;
        let bucket = 6;
        if (result) {
          const owner = edgeOwners[index],
            d = edgeDistances[index];
          if (!running || method === "together") {
            if (d <= radius || !running)
              bucket = running && d > radius - 0.22 ? 7 : owner;
          } else {
            const val = Math.min(
              result.distances[stage][u],
              result.distances[stage][v],
            );
            if (val <= radius) bucket = val > radius - 0.22 ? 7 : stage;
          }
        }
        buckets[bucket].push(index);
      });
      const trace = (index: number) =>
        projectedShapes[index].forEach(([x, y], j) => {
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      buckets.forEach((lines, i) => {
        ctx.beginPath();
        ctx.strokeStyle = i === 6 ? "#32413d" : i === 7 ? "#ecfff4" : colors[i];
        ctx.globalAlpha = i === 6 ? 0.64 : running ? 0.8 : 0.42;
        ctx.lineWidth = i === 7 ? 1.5 : i === 6 ? 0.65 : 0.9;
        lines.forEach(trace);
        ctx.stroke();
      });
      if (result && !running) {
        ctx.globalAlpha = 1;
        result.pathEdges.forEach((path, i) => {
          for (const glow of [true, false]) {
            ctx.beginPath();
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = glow ? 11 : 3;
            ctx.globalAlpha = glow ? 0.16 : 1;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            path.forEach(trace);
            ctx.stroke();
          }
        });
      }
    };
    m.on("moveend zoomend resize", () => draw.current());
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (latest.current.active !== null)
        latest.current.onPick(e.latlng.lat, e.latlng.lng);
    });
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
      draw.current();
    });
    resize.observe(root.current);
    fit();
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (props.result && !props.running) fit();
  }, [props.result, props.running]);
  useEffect(() => {
    draw.current();
  }, [
    props.network,
    props.result,
    props.progress,
    props.running,
    props.method,
  ]);
  useEffect(() => {
    const layer = friendLayer.current;
    if (!layer) return;
    layer.clearLayers();
    props.friends.forEach((f, i) => {
      const el = document.createElement("div");
      el.className = `friend-pin${props.active === f.id ? " selected" : ""}`;
      el.style.setProperty("--pin", colors[i]);
      const label = document.createElement("span");
      label.className = "pin-label";
      label.textContent = f.name || `Friend ${i + 1}`;
      el.append(label);
      const avatar = document.createElement("span");
      avatar.className = "pin-avatar";
      avatar.textContent = (f.name || "?").slice(0, 1).toUpperCase();
      el.append(avatar);
      const marker = L.marker([f.place.lat, f.place.lng], {
        title: `${f.name}: ${f.place.name}. Drag to move.`,
        alt: `${f.name}'s starting point`,
        draggable: !props.running,
        icon: L.divIcon({
          className: "pin-container",
          html: el,
          iconSize: [36, 58],
          iconAnchor: [18, 54],
        }),
      });
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        latest.current.onMove(f.id, p.lat, p.lng);
      });
      marker.addTo(layer);
    });
  }, [props.friends, props.active, props.running]);
  useEffect(() => {
    const layer = meetingLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (props.result && !props.running && props.network) {
      const p = props.network.nodes[props.result.meeting];
      L.marker([p[0], p[1]], {
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: "meeting-pin",
          html: '<span class="meeting-label">MEET HERE</span><span class="meeting-icon">✳</span>',
          iconSize: [46, 70],
          iconAnchor: [23, 58],
        }),
      }).addTo(layer);
    }
  }, [props.result, props.running, props.network]);
  return (
    <div className={`map-shell ${props.active !== null ? "pick-mode" : ""}`}>
      <div
        ref={root}
        className="leaflet-map"
        aria-label="Interactive Jakarta map. Drag friend markers to change starting points."
      />
      <div className="map-controls">
        <button onClick={() => map.current?.zoomIn()} aria-label="Zoom in">
          <Plus size={18} />
        </button>
        <button onClick={() => map.current?.zoomOut()} aria-label="Zoom out">
          <Minus size={18} />
        </button>
        <button
          onClick={fit}
          aria-label="Fit all friends on map"
          title="Fit all friends"
        >
          <LocateFixed size={18} />
        </button>
      </div>
    </div>
  );
}
