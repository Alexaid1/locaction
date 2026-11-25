"""Собирает справочники для интерфейса из уже опубликованных данных OSM (ODbL):

- map/addresses/index.json и map/addresses/<код буквы>.json - адреса зданий из map/buildings.pmtiles;
- map/metro.json - станции метро из commercial-history (выгружены из OSM).

    .venv-tools/Scripts/python tools/build_lookup.py [--metro PATH]

Нужны пакеты pmtiles и mapbox-vector-tile. shard_key повторяет shardKey из app/search.mjs.
"""
import argparse
import csv
import gzip
import json
import math
import re
from datetime import date
from pathlib import Path

import mapbox_vector_tile
from pmtiles.reader import MmapSource, Reader, all_tiles

ROOT = Path(__file__).resolve().parents[1]
METRO_CSV = Path('D:/Urban/commercial-history/data/reference/metro_stations.csv')
TODAY = date(2026, 11, 25)

STREET_TYPES = {
    'улица', 'ул', 'проспект', 'пр', 'пр-т', 'просп', 'переулок', 'пер', 'шоссе', 'ш', 'бульвар', 'б-р', 'бул',
    'площадь', 'пл', 'проезд', 'пр-д', 'набережная', 'наб', 'тупик', 'туп', 'аллея', 'линия', 'квартал', 'кв-л',
    'дом', 'д', 'владение', 'вл', 'город', 'г', 'москва',
}
BUILDING = {'к': 'к', 'корп': 'к', 'корпус': 'к', 'с': 'с', 'стр': 'с', 'строение': 'с'}
GLUED = re.compile(r'^(\d+[а-я]?(?:/\d+[а-я]?)?)(к|корп|с|стр)(\d+)$')
SPLIT = re.compile(r'[\s,.;:()"«»№]+')


def normalize(text):
    raw = [t for t in SPLIT.split(text.lower().replace('ё', 'е')) if t]
    out, i = [], 0
    while i < len(raw):
        token = raw[i]
        glued = GLUED.match(token)
        if glued:
            out += [glued[1], BUILDING[glued[2]] + glued[3]]
        elif token in BUILDING and i + 1 < len(raw) and raw[i + 1].isdigit():
            out.append(BUILDING[token] + raw[i + 1])
            i += 1
        elif token not in STREET_TYPES:
            out.append(token)
        i += 1
    return out


def shard_key(text):
    for token in normalize(text):
        if re.match(r'^[a-zа-я]', token) and not re.match(r'^[кс]\d', token):
            return token[:2] if len(token) >= 2 else None
    return None


def tile_to_lonlat(z, x, y, px, py, extent):
    n = 2 ** z
    lon = (x + px / extent) / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + py / extent) / n))))
    return lon, lat


def walk(coords):
    if coords and isinstance(coords[0], (int, float)):
        yield coords
    else:
        for item in coords:
            yield from walk(item)


def addresses(archive):
    boxes = {}
    with archive.open('rb') as f:
        reader = Reader(MmapSource(f))
        gzipped = reader.header()['tile_compression'].value == 2
        for (z, x, y), data in all_tiles(reader.get_bytes):
            if gzipped:
                data = gzip.decompress(data)
            layer = mapbox_vector_tile.decode(data, default_options={'y_coord_down': True}).get('buildings')
            if not layer:
                continue
            extent = layer.get('extent', 4096)
            for feature in layer['features']:
                props = feature['properties']
                if not props.get('address'):
                    continue
                points = [tile_to_lonlat(z, x, y, px, py, extent) for px, py in walk(feature['geometry']['coordinates'])]
                if not points:
                    continue
                xs, ys = [p[0] for p in points], [p[1] for p in points]
                box = boxes.setdefault(props['osm'], [props['address'], min(xs), min(ys), max(xs), max(ys)])
                box[1:] = [min(box[1], *xs), min(box[2], *ys), max(box[3], *xs), max(box[4], *ys)]
    return [{'a': a, 'x': round((x0 + x1) / 2, 6), 'y': round((y0 + y1) / 2, 6), 'o': osm}
            for osm, (a, x0, y0, x1, y1) in boxes.items()]


def metro(path):
    seen, out = set(), []
    for row in csv.DictReader(path.open(encoding='utf-8')):
        if row['opened'] and date.fromisoformat(row['opened']) > TODAY:
            continue
        lon, lat = round(float(row['lon']), 5), round(float(row['lat']), 5)
        key = (row['station'], round(lon, 4), round(lat, 4))
        if key not in seen:
            seen.add(key)
            out.append({'name': row['station'], 'lon': lon, 'lat': lat})
    return sorted(out, key=lambda s: (s['name'], s['lon']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metro', type=Path, default=METRO_CSV)
    args = parser.parse_args()

    rows = addresses(ROOT / 'map' / 'buildings.pmtiles')
    shards = {}
    for row in rows:
        key = shard_key(row['a'])
        if key:
            shards.setdefault(key, []).append(row)
    out = ROOT / 'map' / 'addresses'
    out.mkdir(exist_ok=True)
    for old in out.glob('*.json'):
        old.unlink()
    sizes = {}
    for key, items in shards.items():
        items.sort(key=lambda r: r['a'])
        path = out / ('-'.join(f'{ord(c):x}' for c in key) + '.json')
        path.write_text(json.dumps(items, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        sizes[key] = path.stat().st_size
    total = sum(len(v) for v in shards.values())
    (out / 'index.json').write_text(json.dumps(
        {'keys': sorted(shards), 'count': total, 'source': 'OpenStreetMap, map/buildings.pmtiles', 'license': 'ODbL'},
        ensure_ascii=False), encoding='utf-8')

    stations = metro(args.metro)
    (ROOT / 'map' / 'metro.json').write_text(json.dumps(stations, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    biggest = max(sizes.items(), key=lambda kv: kv[1])
    print(f'addresses: {total} in {len(shards)} shards, biggest {biggest[0]} {biggest[1] / 1e6:.2f} MB; metro stations: {len(stations)}')


if __name__ == '__main__':
    main()
