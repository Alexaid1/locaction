"""Собирает map/poi/ - объекты OSM для временного расчёта карточки (вместо Overpass):
конкуренты всех 28 категорий, входы метро, остановки, офисы, якоря потока, вузы.

    .venv-tools/Scripts/python tools/build_poi.py PATH/TO/moscow.osm.pbf

Тот же PBF, из которого собраны подложка и здания (map/SOURCES.md). Нужен пакет osmium.
Ячейки 0,02° широты × 0,04° долготы (~2,2 × 2,5 км): map/poi/<iy>_<ix>.json,
строка - [lon, lat, "ключ=значение", имя | null, "n123" | "w123"]. ODbL.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]
CELL_LAT, CELL_LON = 0.02, 0.04
BOUNDS = (55.1, 56.1, 36.8, 38.0)

# Совпадает с CATEGORIES[].osm (api/stub/osm-categories.mjs) и CONTEXT (api/stub/osm-local.mjs).
WANTED = {
    'amenity': {'restaurant', 'cafe', 'bar', 'pub', 'hookah_lounge', 'fast_food', 'canteen', 'food_court', 'pharmacy',
                'bank', 'bureau_de_change', 'clinic', 'hospital', 'doctors', 'university', 'college'},
    'shop': {'bakery', 'pastry', 'confectionery', 'supermarket', 'convenience', 'grocery', 'butcher', 'cheese', 'deli',
             'greengrocer', 'seafood', 'tea', 'coffee', 'alcohol', 'wine', 'beverages', 'hairdresser', 'beauty', 'clothes',
             'shoes', 'jewelry', 'watches', 'cosmetics', 'perfumery', 'electronics', 'mobile_phone', 'computer', 'tobacco',
             'e-cigarette', 'pet', 'gift', 'books', 'stationery', 'florist', 'variety_store', 'hardware', 'dry_cleaning',
             'laundry', 'tailor', 'shoe_repair', 'outpost', 'copyshop', 'photo', 'travel_agency', 'mall'},
    'railway': {'subway_entrance'},
    'highway': {'bus_stop'},
    'public_transport': {'platform'},
    'leisure': {'fitness_centre', 'sports_centre'},
    'office': None,
}
ORDER = ['railway', 'amenity', 'shop', 'leisure', 'highway', 'public_transport', 'office']


def classify(tags):
    for key in ORDER:
        value = tags.get(key)
        if value is None:
            continue
        allowed = WANTED[key]
        if allowed is None or value in allowed:
            if key == 'office' and 'shop' in tags:
                continue
            return f'{key}={value}'
    return None


class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = []

    def keep(self, kind, oid, lon, lat, tags):
        tag = classify(tags)
        if not tag:
            return
        if not (BOUNDS[0] <= lat <= BOUNDS[1] and BOUNDS[2] <= lon <= BOUNDS[3]):
            return
        self.rows.append([round(lon, 6), round(lat, 6), tag, tags.get('name'), f'{kind}{oid}'])

    def node(self, n):
        if n.tags and n.location.valid():
            self.keep('n', n.id, n.location.lon, n.location.lat, n.tags)

    def way(self, w):
        if not w.tags or classify(w.tags) is None:
            return
        pts = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
        if pts:
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            self.keep('w', w.id, (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, w.tags)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pbf', type=Path)
    args = parser.parse_args()
    handler = Handler()
    handler.apply_file(str(args.pbf), locations=True)

    cells = {}
    for row in handler.rows:
        key = f'{math.floor(row[1] / CELL_LAT)}_{math.floor(row[0] / CELL_LON)}'
        cells.setdefault(key, []).append(row)
    out = ROOT / 'map' / 'poi'
    out.mkdir(exist_ok=True)
    for old in out.glob('*.json'):
        old.unlink()
    for key, rows in cells.items():
        rows.sort(key=lambda r: r[4])
        (out / f'{key}.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tags = sorted({f'{k}={v}' for k, values in WANTED.items() if values for v in values} | {'office=*'})
    (out / 'index.json').write_text(json.dumps({
        'cell': [CELL_LAT, CELL_LON], 'cells': sorted(cells), 'count': len(handler.rows), 'tags': tags,
        'snapshot': '2026-11-23', 'source': 'OpenStreetMap, download.openstreetmap.fr', 'license': 'ODbL',
    }, ensure_ascii=False), encoding='utf-8')
    size = sum(p.stat().st_size for p in out.glob('*.json'))
    print(f'poi: {len(handler.rows)} objects in {len(cells)} cells, {size / 1e6:.1f} MB', file=sys.stderr)


if __name__ == '__main__':
    main()
