"""Build the local MapLibre PMTiles basemap from the read-only project GeoPackage."""

import argparse
import gzip
import math
from pathlib import Path
import sqlite3
import struct

import mapbox_vector_tile
import numpy as np
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from pyproj import Transformer
import shapely
from shapely import STRtree


ROOT = Path(__file__).resolve().parents[1]
MIN_ZOOM, MAX_ZOOM = 7, 14
WORLD = 20037508.342789244
EXTENT = 4096
CITY_LABELS = {'Митино', 'Крюково', 'Тверской', 'Измайлово', 'Марьино', 'Ясенево',
               'Внуково', 'Южное Бутово', 'Отрадное', 'Хорошёво-Мнёвники', 'Кунцево'}
ROAD_CLASSES = {
    'major': (7, 'motorway motorway_link trunk trunk_link primary primary_link'),
    'arterial': (10, 'secondary secondary_link tertiary tertiary_link'),
    'street': (12, 'unclassified residential living_street'),
    'access': (14, 'service track track_grade1 track_grade2 track_grade3 track_grade4 track_grade5'),
    'path': (14, 'footway path steps pedestrian cycleway bridleway'),
}
ROAD_KIND = {fclass: (kind, zoom) for kind, (zoom, classes) in ROAD_CLASSES.items()
             for fclass in classes.split()}


def decode_gpkg(blob):
    assert blob[:2] == b'GP' and blob[2] == 0, 'Expected a GeoPackage geometry'
    envelope = (blob[3] >> 1) & 7
    return blob[8 + (0, 32, 48, 48, 64)[envelope]:]


def read_data(source):
    transformer = Transformer.from_crs(4326, 3857, always_xy=True)

    def project(rows):
        lines = shapely.from_wkb([decode_gpkg(blob) for blob, *_ in rows])
        return shapely.transform(lines, transformer.transform, interleaved=False)

    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as package:
        srs = dict(package.execute('SELECT table_name, srs_id FROM gpkg_geometry_columns'))
        expected = ('districts_ply', 'roads_lin', 'buildings_pts')
        if any(srs.get(name) != 4326 for name in expected):
            raise ValueError('All three source layers must use EPSG:4326')
        districts = list(package.execute('SELECT geom, NAME FROM districts_ply ORDER BY fid'))
        roads = [row for row in package.execute('SELECT geom, fclass, name FROM roads_lin ORDER BY fid')
                 if row[1] in ROAD_KIND]
        buildings = list(package.execute('SELECT geom FROM buildings_pts ORDER BY fid'))

    polygons = shapely.make_valid(project(districts))
    labels = []
    for point, (_, name) in zip(shapely.point_on_surface(polygons), districts):
        label = (name or '').strip().removeprefix('район ').removesuffix(' район')
        if label:
            labels.append((point, {'name': label, 'prominent': label in CITY_LABELS}))
    lines = []
    for geom, (_, fclass, name) in zip(project(roads), roads):
        kind, zoom = ROAD_KIND[fclass]
        lines.append((geom, kind, (name or '').strip(), zoom))
    return polygons, labels, lines, project(buildings)


def only_dimension(geometry, dimension):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'GeometryCollection':
        return [part for member in geometry.geoms for part in only_dimension(member, dimension)]
    return [geometry] if shapely.get_dimensions(geometry) == dimension else []


def tile_range(bounds, zoom):
    west, south, east, north = bounds
    size = 2 * WORLD / (1 << zoom)
    for x in range(math.floor((west + WORLD) / size), math.floor((east + WORLD) / size) + 1):
        for y in range(math.floor((WORLD - north) / size), math.floor((WORLD - south) / size) + 1):
            left, top = x * size - WORLD, WORLD - y * size
            yield x, y, (left, top - size, left + size, top)


def create_tiles(bounds, data, zoom):
    districts, labels, roads, buildings = data
    layers = [
        ('districts', 2, districts, [{}] * len(districts)),
        ('district_labels', 0, [geom for geom, _ in labels], [attrs for _, attrs in labels]),
    ]
    usable_roads = [(geom, {'kind': kind, **({'name': name} if name and zoom >= 12 else {})})
                    for geom, kind, name, min_zoom in roads if min_zoom <= zoom]
    layers.append(('roads', 1, [geom for geom, _ in usable_roads], [attrs for _, attrs in usable_roads]))
    if zoom >= 14:
        layers.append(('building_points', 0, buildings, [{}] * len(buildings)))

    yield from render_tiles(bounds, layers, zoom)


def render_tiles(bounds, layers, zoom, simplification=1.8):
    tolerance = 2 * WORLD / (1 << zoom) / EXTENT * simplification
    indexed = []
    for name, dim, geoms, properties in layers:
        if dim > 0:
            geoms = shapely.simplify(geoms, tolerance, preserve_topology=True)
        indexed.append((name, dim, geoms, properties, STRtree(geoms)))

    for x, y, tile in tile_range(bounds, zoom):
        buffer = (tile[2] - tile[0]) / EXTENT * 64
        clip = shapely.box(tile[0]-buffer, tile[1]-buffer, tile[2]+buffer, tile[3]+buffer)
        encoded = []
        for name, dim, geoms, properties, tree in indexed:
            indexes = np.sort(tree.query(clip, predicate='intersects'))
            clipped = shapely.intersection(np.take(geoms, indexes), clip) if dim else np.take(geoms, indexes)
            features = [{'geometry': part, 'properties': properties[index]}
                        for index, geom in zip(indexes, clipped) for part in only_dimension(geom, dim)]
            if features:
                encoded.append({'name': name, 'features': features})
        if encoded:
            mvt = mapbox_vector_tile.encode(encoded, default_options={'quantize_bounds': tile, 'extents': EXTENT})
            yield x, y, gzip.compress(mvt, compresslevel=6, mtime=0)


def write_archive(destination, bounds, metadata, zooms, tiles_at_zoom):
    to_wgs84 = Transformer.from_crs(3857, 4326, always_xy=True)
    west, south = to_wgs84.transform(*bounds[:2])
    east, north = to_wgs84.transform(*bounds[2:])
    header = {
        'tile_type': TileType.MVT, 'tile_compression': Compression.GZIP,
        'min_lon_e7': round(west * 1e7), 'min_lat_e7': round(south * 1e7),
        'max_lon_e7': round(east * 1e7), 'max_lat_e7': round(north * 1e7),
        'center_lon_e7': round((west + east) / 2 * 1e7), 'center_lat_e7': round((south + north) / 2 * 1e7),
        'center_zoom': 9,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.pmtiles.tmp')
    try:
        with temporary.open('wb') as target:
            writer = Writer(target)
            for zoom in zooms:
                tiles = sorted((zxy_to_tileid(zoom, x, y), tile) for x, y, tile in tiles_at_zoom(zoom))
                for tile_id, tile in tiles:
                    writer.write_tile(tile_id, tile)
                print(f'z{zoom}: {len(tiles)} tiles', flush=True)
            writer.finalize(header, metadata)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'{destination}: {destination.stat().st_size:,} bytes; bounds {(west, south, east, north)}')


def export(source, destination):
    data = read_data(source)
    bounds = shapely.total_bounds(data[0])
    metadata = {'name': 'LOCACTION Moscow local basemap', 'format': 'pbf', 'type': 'baselayer',
                'vector_layers': [
                    {'id': 'districts', 'fields': {}, 'minzoom': MIN_ZOOM, 'maxzoom': MAX_ZOOM},
                    {'id': 'district_labels', 'fields': {'name': 'String', 'prominent': 'Boolean'},
                     'minzoom': MIN_ZOOM, 'maxzoom': MAX_ZOOM},
                    {'id': 'roads', 'fields': {'kind': 'String', 'name': 'String'},
                     'minzoom': MIN_ZOOM, 'maxzoom': MAX_ZOOM},
                    {'id': 'building_points', 'fields': {}, 'minzoom': 14, 'maxzoom': MAX_ZOOM},
                ]}
    write_archive(destination, bounds, metadata, range(MIN_ZOOM, MAX_ZOOM + 1),
                  lambda zoom: create_tiles(bounds, data, zoom))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'map' / 'basemap.pmtiles')
    args = parser.parse_args()
    if args.output.suffix != '.pmtiles' or args.source.resolve() == args.output.resolve():
        parser.error('Use a separate .pmtiles output file')
    export(args.source.resolve(), args.output.resolve())
