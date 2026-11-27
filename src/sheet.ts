export function nearestSnap(height: number, snaps: number[]): number {
  if (!snaps.length) return -1;
  return snaps.reduce(
    (nearest, snap, index) =>
      Math.abs(snap - height) < Math.abs(snaps[nearest] - height)
        ? index
        : nearest,
    0,
  );
}
