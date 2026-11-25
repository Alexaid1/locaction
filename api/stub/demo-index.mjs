// Временный расчёт: демо-индекс v2 (methodology.mjs) для любой категории по объектам OSM.
import { factors } from '../../methodology.mjs';
import { categoryById } from './osm-categories.mjs';
import { haversine, nearestMetro } from '../../app/search.mjs';
import { RADIUS } from './overpass.mjs';

const factor = Object.fromEntries(factors.map((f) => [f.id, f]));

export function toObjects(elements) {
  const out = [];
  const seen = new Set();
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const id = `osm:${el.type}/${el.id}`;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, tags: el.tags ?? {}, lat, lon });
  }
  return out;
}

const has = (tags, [key, values]) => key in tags && (!values || values.includes(tags[key]));
const isCompetitor = (tags, categoryId) => (categoryById.get(categoryId)?.osm ?? []).some((rule) => has(tags, rule));
const isAnchor = (t) => ['supermarket', 'mall'].includes(t.shop) || ['fitness_centre', 'sports_centre'].includes(t.leisure)
  || ['clinic', 'hospital', 'doctors'].includes(t.amenity);
const isStop = (t) => t.highway === 'bus_stop' || t.public_transport === 'platform';
const isOffice = (t) => 'office' in t && !('shop' in t);
const isUniversity = (t) => ['university', 'college'].includes(t.amenity);

const round1 = (value) => Math.round(value * 10) / 10;
const effectOf = (score) => (score >= 0.6 ? 'plus' : score <= 0.3 ? 'minus' : 'neutral');

function kindOf(tags, categoryId) {
  if (isCompetitor(tags, categoryId)) return 'competitor';
  if (tags.railway === 'subway_entrance') return 'metro';
  if (isStop(tags)) return 'stop';
  if (isAnchor(tags)) return 'anchor';
  if (isUniversity(tags)) return 'university';
  if (isOffice(tags)) return 'office';
  return null;
}

const REACH = { competitor: RADIUS, metro: RADIUS, stop: 300, anchor: RADIUS, office: 500, university: RADIUS };

const ROWS = [
  { id: 'metro_dist_m', label: 'До метро', unit: 'm', zone: 'point', icon: 'metro', f: 'metro' },
  { id: 'competitors_300', label: 'Конкуренты', unit: 'count', zone: 'r300', icon: 'competitor', f: 'competitors' },
  { id: 'stops_300', label: 'Остановки', unit: 'count', zone: 'r300', icon: 'stop', f: 'stops' },
  { id: 'offices_500', label: 'Офисы', unit: 'count', zone: 'r500', icon: 'office', f: 'offices' },
  { id: 'attractors_300', label: 'Объекты притяжения', unit: 'count', zone: 'r300', icon: 'anchor', f: 'attractors' },
];

// Оценка места и показатели по пяти значениям демо-индекса v2.
export function indexFromValues(values) {
  let total = 0;
  const indicators = ROWS.map(({ f, ...row }) => {
    const { weight, score } = factor[f];
    const s = score(values[row.id]);
    total += weight * s;
    return { ...row, value: values[row.id], percentile_city: null, effect: effectOf(s), weight: weight / 100 };
  });
  return { score: { value: round1(total), percentile_city: null, method: 'demo_index_v2' }, indicators };
}

export function scorePlace(objects, point, categoryId, stations = []) {
  const located = [];
  for (const object of objects) {
    const kind = kindOf(object.tags, categoryId);
    if (!kind) continue;
    const distance = haversine(point.lon, point.lat, object.lon, object.lat);
    if (distance <= RADIUS) located.push({ ...object, kind, distance });
  }
  const count = (kind, radius) => located.filter((o) => o.kind === kind && o.distance <= radius).length;
  const entrances = located.filter((o) => o.kind === 'metro').sort((a, b) => a.distance - b.distance);
  const metroDist = Math.round(entrances[0]?.distance ?? nearestMetro(point.lon, point.lat, stations)?.distance_m ?? 5000);

  const place = indexFromValues({
    metro_dist_m: metroDist, competitors_300: count('competitor', 300), stops_300: count('stop', 300),
    offices_500: count('office', 500), attractors_300: count('anchor', 300),
  });

  const points = located
    .filter((o) => o.distance <= REACH[o.kind])
    .map((o) => ({
      id: o.id, kind: o.kind, name: o.tags.name ?? null, lat: +o.lat.toFixed(6), lon: +o.lon.toFixed(6),
      distance_m: Math.round(o.distance), effect: o.kind === 'competitor' ? 'minus' : 'plus',
      strength: Math.round(Math.max(0.05, 1 - o.distance / RADIUS) * 100) / 100, source: 'osm',
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 150);

  return { place, points, metroDist };
}
