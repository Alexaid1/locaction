"""Build separate ODbL basemap and building archives from a Moscow OSM PBF extract."""

import argparse
from collections import Counter
import json
from pathlib import Path

import numpy as np
import osmium
from pyproj import Transformer
import shapely

from audit_buildings import district_counts, district_index
from export_basemap import CITY_LABELS, MAX_ZOOM, MIN_ZOOM, ROAD_KIND, ROOT, create_tiles, only_dimension, render_tiles, write_archive


BUILDING_ZOOM = 14
RESIDENTIAL = {'residential', 'apartments', 'house', 'detached', 'semidetached_house', 'terrace', 'dormitory', 'bungalow'}
COMMERCIAL = {'commercial', 'retail', 'office', 'supermarket', 'hotel', 'kiosk'}
OTHER = {'industrial', 'warehouse', 'school', 'kindergarten', 'university', 'college', 'hospital', 'clinic',
         'government', 'civic', 'church', 'chapel', 'cathedral', 'mosque', 'synagogue', 'temple', 'train_station',
         'transportation', 'garage', 'garages', 'service', 'utility', 'sports_hall', 'stadium', 'fire_station'}
OSM_CREDIT = '© OpenStreetMap contributors'
ODBL = 'https://opendatacommons.org/licenses/odbl/1-0/'


def building_type(tags):
    use = tags.get('building:use', '').strip()
    kind = tags.get('building', '').strip()
    source = 'building:use' if use else 'building'
    value = use or kind
    tags_found = {item.strip() for item in value.split(';')}
    if not use and (tags.get('abandoned') == 'yes' or tags.get('disused') == 'yes'):
        return 'unknown', ''
    if 'mixed_use' in tags_found or (tags_found & RESIDENTIAL and tags_found & COMMERCIAL):
        return 'mixed', f'{source}={value}'
    for category, vocabulary in [('residential', RESIDENTIAL), ('commercial', COMMERCIAL), ('other', OTHER)]:
        if tags_found and tags_found <= vocabulary:
            return category, f'{source}={value}'
    return 'unknown', ''


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.WKBFactory()
        self.city = None
        self.districts = []
        self.roads = []
        self.buildings = []

    def way(self, way):
        road = ROAD_KIND.get(way.tags.get('highway'))
        if not road:
            return
        try:
            geom = self.factory.create_linestring(way)
        except (RuntimeError, osmium.InvalidLocationError):
            return
        self.roads.append((geom, *road, way.tags.get('name', '')))

    def area(self, area):
        tags = area.tags
        building = tags.get('building') not in (None, 'no', 'proposed', 'construction') and not tags.get('building:part')
        admin = tags.get('boundary') == 'administrative'
        if not building and (not admin or tags.get('admin_level') not in ('4', '5', '8')):
            return
        try:
            geom = self.factory.create_multipolygon(area)
        except (RuntimeError, osmium.InvalidLocationError):
            return
        if building:
            key = f'{"way" if area.from_way() else "relation"}/{area.orig_id()}'
            kind, evidence = building_type(tags)
            address = ', '.join(value for value in (tags.get('addr:street') or tags.get('addr:place'),
                                                    tags.get('addr:housenumber')) if value)
            attrs = {'osm': key, 'kind': kind}
            if evidence:
                attrs['evidence'] = evidence
            if address and tags.get('addr:housenumber'):
                attrs['address'] = address
            if tags.get('ref:UNOM', tags.get('ref:unom', '')).isdigit():
                attrs['unom'] = tags.get('ref:UNOM', tags.get('ref:unom'))
            self.buildings.append((geom, attrs))
        elif tags.get('admin_level') == '4' and tags.get('name') == 'Москва':
            self.city = geom
        elif tags.get('admin_level') == '8':
            name = tags.get('name', '').removeprefix('район ').removesuffix(' район')
            self.districts.append((geom, name))


def map_polygons(wkb):
    fixed = shapely.make_valid(shapely.from_wkb(wkb))
    return np.array([shapely.union_all(only_dimension(geom, 2)) if geom.geom_type == 'GeometryCollection' else geom
                     for geom in fixed])


def export(pbf, output, ao):
    reader = osmium.io.Reader(str(pbf))
    timestamp = reader.header().get('osmosis_replication_timestamp')
    reader.close()
    extract = Extract()
    extract.apply_file(str(pbf), locations=True)
    if not extract.city:
        raise ValueError('The OSM PBF must contain the complete administrative boundary of Moscow')
    print(f'OSM snapshot {timestamp}; raw footprints {len(extract.buildings):,}; roads {len(extract.roads):,}', flush=True)

    convert = Transformer.from_crs(4326, 3857, always_xy=True).transform
    to_metres = Transformer.from_crs(4326, 32637, always_xy=True).transform
    city = map_polygons([extract.city])[0]
    city_web = shapely.transform(city, convert, interleaved=False)
    shapely.prepare(city)
    bounds = city_web.bounds

    district_shapes = map_polygons([row[0] for row in extract.districts])
    inside = shapely.covers(city, shapely.point_on_surface(district_shapes))
    local_districts = shapely.transform(district_shapes[inside], convert, interleaved=False)
    district_names = [name for (_, name), match in zip(extract.districts, inside) if match]
    labels = [(point, {'name': name, 'prominent': name in CITY_LABELS})
              for point, name in zip(shapely.point_on_surface(local_districts), district_names) if name]
    road_shapes = shapely.from_wkb([row[0] for row in extract.roads])
    city_roads = shapely.intersects(city, road_shapes)
    web_roads = shapely.transform(road_shapes[city_roads], convert, interleaved=False)
    roads = [(geom, kind, name, zoom) for geom, (_, kind, zoom, name) in
             zip(web_roads, (row for row, match in zip(extract.roads, city_roads) if match))]
    base_data = (local_districts if len(local_districts) else [city_web], labels, roads, [])

    footprints = map_polygons([row[0] for row in extract.buildings])
    included = ~shapely.is_empty(footprints) & shapely.covers(city, shapely.point_on_surface(footprints))
    footprints = footprints[included]
    attrs = [row[1] for row, match in zip(extract.buildings, included) if match]
    areas = shapely.area(shapely.transform(footprints, to_metres, interleaved=False))
    for properties, area in zip(attrs, areas):
        properties['footprint'] = max(1, round(area))
    web_buildings = shapely.transform(footprints, convert, interleaved=False)
    counts = Counter(attr['kind'] for attr in attrs)
    print('Published footprints by type:', dict(counts), flush=True)
    demo_ids = {loc['addressSource']['osm'] for loc in json.loads((ROOT / 'demo-data.json').read_bytes())['locations']}
    print('Demo footprint tags:', [item for item in attrs if item['osm'] in demo_ids], flush=True)
    if ao:
        index, names = district_index(ao, 4326)
        tally, outside = district_counts(index, names, footprints)
        print('OSM footprints by AO:', {name: tally[name] for name in names}, '; unmatched:', outside, flush=True)
        if any(tally[name] == 0 for name in names):
            raise ValueError('The OSM extract did not cover all 12 districts')

    common = {'format': 'pbf', 'attribution': OSM_CREDIT, 'license': ODBL, 'osm_snapshot': timestamp}
    base = dict(common, name='LOCACTION OSM basemap', type='baselayer', vector_layers=[
        {'id': 'districts', 'fields': {}}, {'id': 'district_labels', 'fields': {'name': 'String', 'prominent': 'Boolean'}},
        {'id': 'roads', 'fields': {'kind': 'String', 'name': 'String'}},
    ])
    buildings = dict(common, name='LOCACTION OSM building footprints', type='overlay', vector_layers=[
        {'id': 'buildings', 'minzoom': BUILDING_ZOOM, 'maxzoom': BUILDING_ZOOM,
         'fields': {'osm': 'String', 'kind': 'String', 'evidence': 'String', 'address': 'String',
                    'unom': 'String', 'footprint': 'Number'}},
    ])
    write_archive(output / 'osm-basemap.pmtiles', bounds, base, range(MIN_ZOOM, MAX_ZOOM + 1),
                  lambda zoom: create_tiles(bounds, base_data, zoom))
    write_archive(output / 'buildings.pmtiles', bounds, buildings, [BUILDING_ZOOM],
                  lambda zoom: render_tiles(bounds, [('buildings', 2, web_buildings, attrs)], zoom, simplification=0))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pbf', type=Path)
    parser.add_argument('--ao', help='Optional municipal district GeoJSON for read-only coverage QA', type=Path)
    parser.add_argument('--output', default=ROOT / 'map', type=Path)
    args = parser.parse_args()
    export(args.pbf.resolve(), args.output.resolve(), args.ao)
