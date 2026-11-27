# Jakarta street network

`jakarta-network.json` is a derived database licensed under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), distributed through [OpenFreeMap](https://openfreemap.org/) using the [OpenMapTiles](https://openmaptiles.org/) schema. Geometry is clipped, noded, filtered to a connected component, simplified, and contracted into an undirected graph. It is approximate and excludes turn/traffic rules.

The database contains junction coordinates, street edges with distances in kilometers, and edge shape coordinates. Its `tileSource` field identifies the upstream snapshot. The complete derived database is provided here, under ODbL, with a reproducible builder in `scripts/build-network.py` in the repository. The application-code MIT license does not replace the database license.
