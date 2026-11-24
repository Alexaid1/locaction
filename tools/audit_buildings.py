"""Audit the local buildings GeoPackage against Moscow's 12 districts, without writing either source."""

import argparse
from collections import Counter
from contextlib import closing
import json
from pathlib import Path
import sqlite3

from pyproj import Transformer
import shapely
from shapely.geometry import shape

from export_basemap import ROOT, decode_gpkg


def district_index(path, epsg):
    features = json.loads(path.read_bytes())['features']
    project = Transformer.from_crs(4326, epsg, always_xy=True).transform
    polygons = shapely.make_valid(shapely.transform([shape(f['geometry']) for f in features], project, interleaved=False))
    return shapely.STRtree(polygons), [feature['properties']['NAME'] for feature in features]


def district_counts(index, names, polygons):
    pairs = index.query(shapely.point_on_surface(polygons), predicate='intersects')
    return Counter(names[district] for district in pairs[1]), len(polygons) - len(set(pairs[0]))


def audit(gpkg, ao):
    index, names = district_index(ao, 32637)
    known = {3306397: 'A', 51504: 'B', 51687: 'C'}
    demo = {location['id']: location for location in json.loads((ROOT / 'demo-data.json').read_bytes())['locations']}
    project = Transformer.from_crs(4326, 32637, always_xy=True)
    counts, unoms, stats = Counter(), Counter(), Counter()
    matches = []
    with closing(sqlite3.connect(gpkg.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        geom_type, crs = db.execute('SELECT geometry_type_name, srs_id FROM gpkg_geometry_columns WHERE table_name=?',
                                    ('moscow_buildings_test',)).fetchone()
        if (geom_type, crs) != ('MULTIPOLYGON', 32637):
            raise ValueError('Expected MultiPolygon, EPSG:32637')
        rows = db.execute("""SELECT geom, json_extract(attributes,'$.UNOM'), datasetId,
            json_extract(attributes,'$.SIMPLE_ADDRESS') FROM moscow_buildings_test
            WHERE json_extract(attributes,'$.OBJ_TYPE')='Здание'""")
        while batch := rows.fetchmany(8192):
            stats['rows'] += len(batch)
            stats['missing_geom'] += sum(row[0] is None for row in batch)
            unoms.update(str(row[1]) for row in batch if row[1] not in (None, '', 0))
            selected = [row for row in batch if row[0] is not None]
            raw = shapely.from_wkb([decode_gpkg(row[0]) for row in selected])
            stats['invalid'] += int((~shapely.is_valid(raw)).sum())
            stats['empty'] += int(shapely.is_empty(raw).sum())
            stats['multi_part'] += int((shapely.get_num_geometries(raw) > 1).sum())
            for polygon in shapely.get_parts(raw):
                stats['inner_rings'] += shapely.get_num_interior_rings(polygon)
            fixed = shapely.make_valid(raw)
            covered, outside = district_counts(index, names, fixed)
            counts.update(covered)
            stats['outside_ao'] += outside
            for (_, unom, dataset, address), geom in zip(selected, fixed):
                if unom in known:
                    key = known[unom]
                    coords = demo[key]['coordinates']
                    point = shapely.Point(project.transform(coords['lon'], coords['lat']))
                    matches.append((key, unom, dataset, address, round(float(shapely.distance(point, geom)), 1)))

    duplicates = [count for count in unoms.values() if count > 1]
    print('Records:', dict(stats))
    print(f'UNOM: {len(unoms)} unique, {len(duplicates)} repeated, {sum(count - 1 for count in duplicates)} extra rows, '
          f'{stats["rows"] - sum(unoms.values())} missing')
    print('AO:', {name: counts[name] for name in names})
    print('Demo (id, UNOM, datasetId, address, point-to-polygon metres):', sorted(matches))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('gpkg', type=Path)
    parser.add_argument('ao', type=Path)
    args = parser.parse_args()
    audit(args.gpkg, args.ao)
