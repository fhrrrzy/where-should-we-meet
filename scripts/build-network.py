"""Build the bundled, undirected Jakarta street graph from OSM-derived vector tiles.

Optional data maintenance only: pip install mapbox-vector-tile shapely requests
Usage: python scripts/build-network.py
No map service or Python dependency is required to run the app.
"""
import concurrent.futures
import hashlib
import json
import math
from pathlib import Path

import mapbox_vector_tile
import requests
from shapely.geometry import LineString, box
from shapely import union_all

ROOT = Path(__file__).resolve().parents[1]
ZOOM = 13
EXTENT = 4096
WEST, SOUTH, EAST, NORTH = 106.72, -6.36, 106.97, -6.10
def tile(lng, lat):
    return ((lng + 180) / 360 * 2**ZOOM,
            (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**ZOOM)
left, top = tile(WEST, NORTH)
right, bottom = tile(EAST, SOUTH)
version = requests.get('https://tiles.openfreemap.org/planet', timeout=30).json()['tiles'][0]
CACHE = ROOT / '.tile-cache' / hashlib.sha256(version.encode()).hexdigest()[:16]
CACHE.mkdir(parents=True,exist_ok=True)
tasks = [(x,y) for x in range(math.floor(left),math.floor(right)+1)
         for y in range(math.floor(top),math.floor(bottom)+1)]
print(f'Downloading {len(tasks)} tiles for the fixed Jakarta coverage', flush=True)
def fetch(pair):
    x,y=pair
    file=CACHE/f'{ZOOM}-{x}-{y}.pbf'
    if not file.exists():
        response=requests.get(version.format(z=ZOOM,x=x,y=y),timeout=45)
        response.raise_for_status()
        file.write_bytes(response.content)
    data=mapbox_vector_tile.decode(file.read_bytes())
    lines=[]
    for f in data.get('transportation',{}).get('features',[]):
        p=f['properties']
        if p.get('class') not in {'primary','secondary','tertiary','minor','trunk','motorway'}:continue
        if p.get('access') in {'no','private'}:continue
        g=f['geometry']
        parts=[g['coordinates']] if g['type']=='LineString' else g['coordinates'] if g['type']=='MultiLineString' else []
        grade=(p.get('layer',0),p.get('brunnel',''))
        for points in parts:
            coords=[(x*EXTENT+a,y*EXTENT+(EXTENT-b)) for a,b in points]
            if len(set(coords))>1:lines.append((grade,LineString(coords)))
    return lines
groups={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for parts in pool.map(fetch,tasks):
        for grade,line in parts:groups.setdefault(grade,[]).append(line)
print('Joining street geometries, keeping bridge/tunnel levels separate', flush=True)
clip=box(left*EXTENT,top*EXTENT,right*EXTENT,bottom*EXTENT)
node_ids={}
nodes=[]
edges=set()
def node_id(coord):
    key=tuple(round(c,2) for c in coord)
    if key not in node_ids:
        node_ids[key]=len(nodes)
        x,y=key
        lng=x/(2**ZOOM*EXTENT)*360-180
        lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*y/(2**ZOOM*EXTENT)))))
        nodes.append([round(lat,6),round(lng,6)])
    return node_ids[key]
def add_geometry(geom):
    if geom.is_empty:return
    if geom.geom_type=='LineString':
        ids=[node_id(c) for c in geom.coords]
        for a,b in zip(ids,ids[1:]):
            if a!=b:edges.add(tuple(sorted((a,b))))
    elif hasattr(geom,'geoms'):
        for part in geom.geoms:add_geometry(part)
for lines in groups.values():add_geometry(union_all(lines,grid_size=1).intersection(clip))
adj=[[] for _ in nodes]
for a,b in edges:adj[a].append(b);adj[b].append(a)
seen=set()
largest=[]
for i in range(len(nodes)):
    if i in seen:continue
    seen.add(i);stack=[i];component=[]
    while stack:
        u=stack.pop();component.append(u)
        for v in adj[u]:
            if v not in seen:seen.add(v);stack.append(v)
    if len(component)>len(largest):largest=component
largest=set(largest)
junctions=sorted(i for i in largest if len(adj[i])!=2)
mapping={old:new for new,old in enumerate(junctions)}
compressed=[]
shapes=[]
visited=set()
def km(a,b):
    r=math.pi/180
    return math.hypot((b[1]-a[1])*r*math.cos((a[0]+b[0])*r/2),(b[0]-a[0])*r)*6371
for start in junctions:
    for nxt in adj[start]:
        key=tuple(sorted((start,nxt)))
        if key in visited:continue
        visited.add(key);chain=[start,nxt];prev=start;curr=nxt
        while curr not in mapping:
            following=next(v for v in adj[curr] if v!=prev)
            visited.add(tuple(sorted((curr,following))))
            chain.append(following);prev,curr=curr,following
        if curr==start:continue
        length=sum(km(nodes[a],nodes[b]) for a,b in zip(chain,chain[1:]))
        shape=list(LineString([nodes[i] for i in chain]).simplify(0.000025).coords)
        compressed.append([mapping[start],mapping[curr],round(length,6)])
        shapes.append(shape)
output={'source':'OpenStreetMap contributors via OpenFreeMap / OpenMapTiles; ODbL 1.0',
        'tileSource':version,'zoom':ZOOM,'bounds':[SOUTH,WEST,NORTH,EAST],
        'nodes':[nodes[i] for i in junctions], 'edges':compressed, 'shapes':shapes}
target=ROOT/'public/data/jakarta-network.json'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(output,separators=(',',':'))+'\n')
print(f'{len(output["nodes"]):,} nodes, {len(output["edges"]):,} segments; {target.stat().st_size:,} bytes',flush=True)
