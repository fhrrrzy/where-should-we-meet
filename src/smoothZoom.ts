import type L from "leaflet";

type MapInternals = {
  _move(center: L.LatLng, zoom: number, data?: unknown): void;
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): void;
  _moveEnd(zoomChanged: boolean): void;
  _stop(): void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function wheelZoomDelta(e: {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}): number {
  const px =
    e.deltaMode === 1
      ? e.deltaY * 20
      : e.deltaMode === 2
        ? e.deltaY * 400
        : e.deltaY;
  return clamp(-px * (e.ctrlKey ? 0.012 : 0.005), -1, 1);
}

export function easeZoom(
  current: number,
  target: number,
  dtMs: number,
  tauMs = 80,
): number {
  if (dtMs <= 0) return current;
  if (tauMs <= 0) return target;
  const result = current + (target - current) * (1 - Math.exp(-dtMs / tauMs));
  return Math.abs(target - result) < 0.001 ? target : result;
}

export function createSmoothZoom(map: L.Map): {
  zoomBy(delta: number, around?: L.Point, immediate?: boolean): void;
  stop(): void;
} {
  const internal = map as unknown as L.Map & MapInternals;
  let moving = false,
    target = map.getZoom(),
    anchorPoint: L.Point | null = null,
    anchorLatLng: L.LatLng | null = null,
    frameId = 0,
    lastFrameTime = 0,
    lastRequest = 0,
    immediate = false;

  const finish = () => {
    if (!moving) return;
    internal._moveEnd(true);
    moving = false;
    lastFrameTime = 0;
  };

  const frame = (time: number) => {
    frameId = 0;
    if (!moving || !anchorPoint || !anchorLatLng) return;
    const dt = lastFrameTime ? time - lastFrameTime : 16;
    lastFrameTime = time;
    const zoom = immediate ? target : easeZoom(map.getZoom(), target, dt);
    const center = map.unproject(
      map
        .project(anchorLatLng, zoom)
        .subtract(anchorPoint.subtract(map.getSize().divideBy(2))),
      zoom,
    );
    internal._move(center, zoom);
    if (zoom === target && time - lastRequest >= 120) finish();
    else frameId = requestAnimationFrame(frame);
  };

  return {
    zoomBy(delta, around, immediateZoom = false) {
      if (!moving) {
        internal._stop();
        internal._moveStart(true, false);
        moving = true;
        target = map.getZoom();
        lastFrameTime = 0;
      }
      target = clamp(target + delta, map.getMinZoom(), map.getMaxZoom());
      anchorPoint = around ?? map.getSize().divideBy(2);
      anchorLatLng = map.containerPointToLatLng(anchorPoint);
      immediate =
        immediateZoom || matchMedia("(prefers-reduced-motion: reduce)").matches;
      lastRequest = performance.now();
      if (!frameId) frameId = requestAnimationFrame(frame);
    },
    stop() {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      finish();
    },
  };
}
