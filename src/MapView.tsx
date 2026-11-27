import { useEffect, useRef } from "react";
import L from "leaflet";
import { LocateFixed, Maximize2, Minus, Plus } from "lucide-react";
import {
  friendLabel,
  friendInitial,
  friendColor,
  sameLocation,
  places,
  type Friend,
} from "./places";
import type { Network, SearchResult } from "./graph";
import { createStreetRenderer } from "./streetRenderer";
import { locate } from "./geolocate";
import { insideCoverage } from "./planner";
import { createSmoothZoom, wheelZoomDelta } from "./smoothZoom";

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
  onAdd: (lat: number, lng: number) => void;
  onNotice: (message: string) => void;
};
export default function MapView(props: Props) {
  const root = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    smoothZoom = useRef<ReturnType<typeof createSmoothZoom> | null>(null),
    canvas = useRef<HTMLCanvasElement | null>(null),
    friendLayer = useRef<L.LayerGroup | null>(null),
    meetingLayer = useRef<L.LayerGroup | null>(null),
    locationLayer = useRef<L.LayerGroup | null>(null),
    latest = useRef(props);
  latest.current = props;
  const draw = useRef<{ draw: () => void }>({ draw: () => {} });
  const fit = () => {
    const mobile = window.innerWidth <= 760;
    const phonePortrait = mobile && window.innerHeight > 500;
    const done = !!latest.current.result && !latest.current.running;
    if (map.current) {
      const size = map.current.getSize();
      const topLeft = mobile ? [45, 100] : [375, 100];
      const sidebar = root.current
        ?.closest(".workspace")
        ?.querySelector(".sidebar")
        ?.getBoundingClientRect();
      const bottomRight = mobile
        ? [
            phonePortrait ? 72 : 45,
            phonePortrait ? (sidebar?.height ?? 0) + 24 : 170,
          ]
        : [done ? 345 : 80, 80];
      if (mobile && size.y <= 500) {
        topLeft[1] = 95;
        // Clustered markers can spread 64px past their true coordinates;
        // reserve that plus the label/handle, not just the raw bounds.
        const card = root.current
          ?.closest(".map-column")
          ?.querySelector(".result-card")
          ?.getBoundingClientRect();
        topLeft[0] = 90;
        bottomRight[0] = done
          ? (card
              ? size.x -
                card.left +
                (root.current?.getBoundingClientRect().left ?? 0)
              : 289) + 112
          : 90;
        bottomRight[1] = 105;
      }
      for (const [axis, available] of [size.x, size.y].map((s, i) => [
        i,
        Math.max(0, s - 100),
      ])) {
        const ratio = Math.min(
          1,
          available / (topLeft[axis] + bottomRight[axis]),
        );
        topLeft[axis] *= ratio;
        bottomRight[axis] *= ratio;
      }
      map.current.fitBounds(
        L.latLngBounds(
          latest.current.friends.map(
            (f) => [f.place.lat, f.place.lng] as [number, number],
          ),
        ),
        {
          paddingTopLeft: L.point(topLeft[0], topLeft[1]),
          paddingBottomRight: L.point(bottomRight[0], bottomRight[1]),
          maxZoom: 13,
          animate: false,
        },
      );
    }
  };
  useEffect(() => {
    if (!root.current) return;
    const m = L.map(root.current, {
      center: [-6.205, 106.827],
      zoom: 12,
      zoomAnimation: false,
      zoomSnap: 0,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      zoomControl: false,
      attributionControl: false,
      minZoom: 9,
      maxZoom: 16,
      // Viewport centering must be free to reserve room for floating controls.
      // Starting points are independently validated against data coverage.
    });
    map.current = m;
    const zoomController = createSmoothZoom(m);
    smoothZoom.current = zoomController;
    L.control
      .attribution({ prefix: false, position: "bottomright" })
      .addAttribution(
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org" target="_blank" rel="noreferrer">OpenMapTiles</a>',
      )
      .addTo(m);
    L.control
      .scale({ metric: true, imperial: false, position: "bottomleft" })
      .addTo(m);
    const c = L.DomUtil.create(
      "canvas",
      "street-canvas",
      m.getPane("overlayPane")!,
    );
    canvas.current = c;
    friendLayer.current = L.layerGroup().addTo(m);
    meetingLayer.current = L.layerGroup().addTo(m);
    locationLayer.current = L.layerGroup().addTo(m);
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
          keyboard: false,
          icon: L.divIcon({
            className: "area-label",
            html: p.name,
            iconSize: [100, 20],
            iconAnchor: [50, 10],
          }),
        }).addTo(labels),
      );
    const renderer = createStreetRenderer(m, c, () => latest.current);
    draw.current = renderer;
    m.on("zoom moveend zoomend resize", () => renderer.draw());
    const container = m.getContainer();
    const mapPane = m.getPane("mapPane")!;
    const onMap = (target: EventTarget | null) =>
      target === container ||
      (target instanceof Node && mapPane.contains(target));
    const onWheel = (event: WheelEvent) => {
      if (!onMap(event.target)) return;
      event.preventDefault();
      zoomController.zoomBy(
        wheelZoomDelta(event),
        m.mouseEventToContainerPoint(event),
        event.ctrlKey || (event.deltaMode === 0 && Math.abs(event.deltaY) < 40),
      );
    };
    const onDoubleClick = (event: L.LeafletMouseEvent) => {
      zoomController.zoomBy(
        event.originalEvent.shiftKey ? -1 : 1,
        event.containerPoint,
      );
    };
    const stopZoom = (event: Event) => {
      if (onMap(event.target)) zoomController.stop();
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("pointerdown", stopZoom, true);
    container.addEventListener("touchstart", stopZoom, {
      capture: true,
      passive: true,
    });
    m.on("dblclick", onDoubleClick);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (latest.current.active !== null)
        latest.current.onPick(e.latlng.lat, e.latlng.lng);
    });
    m.on("contextmenu", (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();
      const current = latest.current;
      if (current.running) return;
      const content = document.createElement("div");
      content.className = "start-popup";
      const title = document.createElement("strong");
      title.textContent = "Start here";
      content.append(title);
      const choices = document.createElement("div");
      choices.className = "start-popup-choices";
      const closePopup = (popup: L.Popup) => m.closePopup(popup);
      const popup = L.popup({ closeButton: true, maxWidth: 260 }).setLatLng(
        e.latlng,
      );
      current.friends.forEach((friend) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "start-popup-choice";
        button.style.setProperty("--friend-color", friendColor(friend));
        const avatar = document.createElement("span");
        avatar.className = "start-popup-avatar";
        avatar.textContent = friendInitial(friend);
        const name = document.createElement("span");
        name.textContent = friendLabel(friend);
        button.append(avatar, name);
        button.addEventListener("click", () => {
          latest.current.onMove(friend.id, e.latlng.lat, e.latlng.lng);
          closePopup(popup);
        });
        choices.append(button);
      });
      if (current.friends.length < 6) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "start-popup-add";
        button.textContent = "Add friend here";
        button.addEventListener("click", () => {
          latest.current.onAdd(e.latlng.lat, e.latlng.lng);
          closePopup(popup);
        });
        choices.append(button);
      }
      content.append(choices);
      popup.setContent(content).openOn(m);
    });
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
      draw.current.draw();
    });
    resize.observe(root.current);
    fit();
    return () => {
      resize.disconnect();
      zoomController.stop();
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", stopZoom, true);
      container.removeEventListener("touchstart", stopZoom, true);
      m.off("dblclick", onDoubleClick);
      m.remove();
      map.current = null;
      smoothZoom.current = null;
    };
  }, []);
  useEffect(() => {
    if (props.result && !props.running) fit();
  }, [props.result, props.running]);
  useEffect(() => {
    draw.current.draw();
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
    const m = map.current!;
    let pinZoom = m.getZoom();
    const renderPins = () => {
      pinZoom = m.getZoom();
      layer.clearLayers();
      props.friends.forEach((f) => {
        const original = L.latLng(f.place.lat, f.place.lng);
        const screen = m.latLngToContainerPoint(original);
        const peers = props.friends.filter(
          (p) =>
            m
              .latLngToContainerPoint([p.place.lat, p.place.lng])
              .distanceTo(screen) < 70,
        );
        const overlapMeeting =
          props.result &&
          !props.running &&
          props.network &&
          m
            .latLngToContainerPoint(
              sameLocation(props.friends)
                ? [props.friends[0].place.lat, props.friends[0].place.lng]
                : L.latLng(
                    props.network.nodes[props.result.meeting][0],
                    props.network.nodes[props.result.meeting][1],
                  ),
            )
            .distanceTo(screen) < 65;
        let position = original;
        if (peers.length > 1 || overlapMeeting) {
          const angle =
            (peers.findIndex((p) => p.id === f.id) / peers.length) *
              Math.PI *
              2 -
            Math.PI / 2;
          const spread = screen.add(
            L.point(Math.cos(angle) * 64, Math.sin(angle) * 64),
          );
          position = m.containerPointToLatLng(spread);
          L.polyline([original, position], {
            color: friendColor(f),
            weight: 1,
            opacity: 0.6,
            interactive: false,
          }).addTo(layer);
        }
        const el = document.createElement("div");
        el.className = `friend-pin${props.active === f.id ? " selected" : ""}`;
        el.style.setProperty("--pin", friendColor(f));
        const label = document.createElement("span");
        label.className = "pin-label";
        label.textContent = friendLabel(f);
        el.append(label);
        const avatar = document.createElement("span");
        avatar.className = "pin-avatar";
        avatar.textContent = friendInitial(f);
        el.append(avatar);
        const marker = L.marker(position, {
          title: `${friendLabel(f)}: ${f.place.name}. Drag or use arrow keys to move.`,
          alt: `${friendLabel(f)}'s starting point`,
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
        marker.getElement()?.addEventListener("keydown", (event) => {
          if (latest.current.running || latest.current.active !== null) return;
          const offsets: Record<string, [number, number]> = {
            ArrowUp: [0, -10],
            ArrowDown: [0, 10],
            ArrowLeft: [-10, 0],
            ArrowRight: [10, 0],
          };
          const offset = offsets[event.key];
          if (!offset) return;
          event.preventDefault();
          event.stopPropagation();
          const point = m.containerPointToLatLng(
            m.latLngToContainerPoint(original).add(L.point(...offset)),
          );
          latest.current.onMove(f.id, point.lat, point.lng);
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>(`[data-friend-id="${f.id}"]`)
              ?.focus(),
          );
        });
        marker.getElement()?.setAttribute("data-friend-id", String(f.id));
      });
    };
    renderPins();
    const onSettled = () => {
      if (m.getZoom() !== pinZoom) renderPins();
    };
    m.on("zoomend moveend", onSettled);
    return () => {
      m.off("zoomend moveend", onSettled);
    };
  }, [props.friends, props.active, props.running, props.result, props.network]);
  useEffect(() => {
    const layer = meetingLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (props.result && !props.running && props.network) {
      const p = sameLocation(props.friends)
        ? [props.friends[0].place.lat, props.friends[0].place.lng]
        : props.network.nodes[props.result.meeting];
      L.marker([p[0], p[1]], {
        keyboard: false,
        interactive: false,
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
  async function locateMe() {
    try {
      const position = await locate();
      const layer = locationLayer.current;
      const m = map.current;
      if (!layer || !m) return;
      layer.clearLayers();
      const point = L.latLng(position.lat, position.lng);
      L.circle(point, {
        radius: position.accuracy,
        color: "#4285F4",
        fillColor: "#4285F4",
        fillOpacity: 0.12,
        weight: 0,
        interactive: false,
      }).addTo(layer);
      L.circleMarker(point, {
        radius: 7,
        fillColor: "#4285F4",
        fillOpacity: 1,
        color: "#fff",
        weight: 2,
        interactive: false,
      }).addTo(layer);
      const workspace = root.current?.closest(".workspace");
      const sidebar = workspace?.querySelector<HTMLElement>(".sidebar");
      const sidebarRect = sidebar?.getBoundingClientRect();
      const mapRect = root.current?.getBoundingClientRect();
      const phonePortrait =
        window.innerWidth <= 760 && window.innerHeight > 500;
      let center = point;
      if (phonePortrait) {
        center = m.unproject(
          m.project(point, 15).add([0, (sidebarRect?.height ?? 0) / 2]),
          15,
        );
      } else if (
        window.innerWidth > 760 &&
        sidebar &&
        !sidebar.classList.contains("collapsed") &&
        sidebarRect &&
        mapRect
      ) {
        const sidebarRight = sidebarRect.right - mapRect.left;
        center = m.unproject(
          m.project(point, 15).subtract([sidebarRight / 2, 0]),
          15,
        );
      }
      m.flyTo(center, 15);
      if (!insideCoverage(position.lat, position.lng))
        latest.current.onNotice("You’re outside Jakarta coverage.");
    } catch {
      latest.current.onNotice("Location unavailable.");
    }
  }
  return (
    <div className={`map-shell ${props.active !== null ? "pick-mode" : ""}`}>
      <div
        ref={root}
        className="leaflet-map"
        aria-label="Interactive Jakarta map. Drag friend markers to change starting points."
      />
      <div className="map-controls">
        <button onClick={locateMe} aria-label="My location" title="My location">
          <LocateFixed size={18} />
        </button>
        <button
          onClick={fit}
          aria-label="Fit all friends on map"
          title="Fit all friends"
        >
          <Maximize2 size={18} />
        </button>
        <div className="zoom-controls">
          <button
            onClick={() => smoothZoom.current?.zoomBy(1)}
            aria-label="Zoom in"
          >
            <Plus size={18} />
          </button>
          <button
            onClick={() => smoothZoom.current?.zoomBy(-1)}
            aria-label="Zoom out"
          >
            <Minus size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
