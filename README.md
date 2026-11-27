# Meet halfway

Different starts. One common ground. A Jakarta-first meeting-point planner inspired by the colorful street-search reel.

## Run locally

Requires Node.js 22 and npm.

```sh
npm ci
npm run dev
```

```sh
npm test       # shortest-path, fair-point and connectivity checks
npm run build # TypeScript check and production build
npm run preview
```

## What it does

- Choose 2–6 friends and saved Jakarta starting points, drag markers, or click the map for a precise pin.
- Minimize the longest trip (balanced) or the sum of all trips.
- Watch simultaneous or sequential shortest-distance waves on the real street geometry.
- See per-friend street distances, replay, share the group's starting points by URL, and explore the meeting coordinates in Google Maps.
- Responsive mobile and desktop layout; reduced-motion support. No backend, tokens, geocoding service, or map API key required.

Names, starting locations, objective and animation mode persist in your browser until Reset and in any share URL you create. Shared links restore the choices and run the search automatically. There is no analytics or account system. Google Fonts may be requested for typography; the app works with system-font fallbacks.

## Deploy on GitHub Pages

1. In **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Merge a pull request into `main` (or run **Check and deploy** from Actions).
3. The workflow tests, type-checks, builds, uploads `dist`, and deploys it to Pages.

The intended project URL is `https://fhrrrzy.github.io/where-should-we-meet/`. Vite uses relative asset paths, including the worker and network data, so project-subdirectory hosting works.

## Distances and coverage

The app runs Dijkstra searches in a web worker over a **bundled, approximate, undirected street graph**, derived from OpenStreetMap geometry in OpenFreeMap / OpenMapTiles zoom-11 vector tiles. This lightweight overview prioritizes major and connecting streets, not every local road. It optimizes over connected street junctions, not every possible point, café, or navigable driving route. The graph retains geometry and road lengths while contracting degree-two nodes. Pins snap to the nearest junction in the largest connected component.

Coverage: mainland Jakarta within 106.68–106.98°E, 6.08–6.38°S, including Kalideres, Cengkareng, Cilincing and Jagakarsa. Islands are not supported. Includes primary, secondary, tertiary, minor, trunk and motorway features available at this overview zoom; not all local streets are represented. Drops more than 350 m from a mapped street are rejected rather than silently routed across water. It excludes private/no-access features, service roads, transit and walking-only paths. Bridge/tunnel/layer geometry is processed separately where tagged, but this is **not a turn-aware routing engine**. Travel times, traffic, one-way restrictions and venue opening hours are not modeled. Confirm an actual journey in your preferred navigation app.

Both animations use identical shortest-distance results; only the reveal order changes. Street-segment counts come from the actual search distances, not a fixed demo counter. A segment is considered reached when its first endpoint is reached; the wave's resolution is one bundled segment.

### Refresh street data (optional)

This is a development-only step, not part of the app build or runtime:

```sh
python -m pip install -r scripts/requirements.txt
python scripts/build-network.py
```

The script downloads a fixed set of tiles for the coverage box, caches them in ignored `.tile-cache/`, nodes geometry, keeps the largest component, and contracts degree-two chains. Remove that cache to refresh tiles. The selected source URL is recorded in the generated data. This graph is an approximation derived from rendered map geometry and should not be substituted for authoritative navigation data.

## Attribution and licensing

Application code: MIT. The bundled street database is separately licensed under **ODbL 1.0**, © OpenStreetMap contributors, via [OpenFreeMap](https://openfreemap.org/) and [OpenMapTiles](https://openmaptiles.org/). See [data attribution](public/data/README.md). The downloaded tiles are not committed.
