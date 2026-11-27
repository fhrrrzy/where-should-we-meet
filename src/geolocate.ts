export type Position = { lat: number; lng: number; accuracy: number };

export function locate(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is unavailable."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
