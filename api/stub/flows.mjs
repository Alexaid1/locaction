// Иллюстрация потоков без модели: отрезки улиц вокруг точки с условной интенсивностью
// утром, днём и вечером. Не замер и не расчёт модели потоков (flows.status = illustration).
import { haversine } from '../../app/search.mjs';
import { RADIUS } from './osm-local.mjs';

const BASE = { path: 0.8, street: 0.7, arterial: 0.6, major: 0.5, access: 0.4 };
const PIECE_M = 60;
const MAX_FEATURES = 2000;

function lines(feature) {
  const { type, coordinates } = feature.geometry ?? {};
  if (type === 'LineString') return [coordinates];
  if (type === 'MultiLineString') return coordinates;
  return [];
}

function pieces(coords) {
  const out = [];
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const n = Math.max(1, Math.ceil(haversine(x0, y0, x1, y1) / PIECE_M));
    for (let k = 0; k < n; k++) {
      const a = k / n;
      const b = (k + 1) / n;
      out.push([[x0 + (x1 - x0) * a, y0 + (y1 - y0) * a], [x0 + (x1 - x0) * b, y0 + (y1 - y0) * b]]);
    }
  }
  return out;
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const r3 = (v) => Math.round(v * 1000) / 1000;
const nearest = (x, y, list) => list.reduce((best, p) => Math.min(best, haversine(x, y, p.lon, p.lat)), Infinity);

export function buildFlows(roads, point, points) {
  const metro = points.filter((p) => p.kind === 'metro');
  const anchors = points.filter((p) => p.kind === 'anchor');
  const seen = new Set();
  const raw = [];
  for (const road of roads ?? []) {
    const base = BASE[road.properties?.kind] ?? 0.5;
    for (const line of lines(road)) {
      for (const [a, b] of pieces(line)) {
        if (haversine(a[0], a[1], point.lon, point.lat) > RADIUS || haversine(b[0], b[1], point.lon, point.lat) > RADIUS) continue;
        const coords = [[r6(a[0]), r6(a[1])], [r6(b[0]), r6(b[1])]];
        const key = coords.flat().join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const m = Math.exp(-nearest(mx, my, metro) / 300);
        const an = Math.exp(-nearest(mx, my, anchors) / 200);
        const p = Math.exp(-haversine(mx, my, point.lon, point.lat) / 400);
        raw.push({ coords, morning: base * (0.4 + 0.6 * m) * (0.5 + 0.5 * p), day: base * (0.3 + 0.4 * an + 0.3 * p), evening: base * (0.4 + 0.4 * m + 0.2 * an) });
      }
    }
  }
  raw.sort((a, b) => Math.max(b.morning, b.day, b.evening) - Math.max(a.morning, a.day, a.evening));
  const kept = raw.slice(0, MAX_FEATURES);
  const top = Math.max(0, ...kept.flatMap((r) => [r.morning, r.day, r.evening])) || 1;
  return {
    type: 'FeatureCollection',
    features: kept.map((r) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: r.coords },
      properties: { morning: r3(r.morning / top), day: r3(r.day / top), evening: r3(r.evening / top) },
    })),
  };
}

export function localIntensity(segments, point, radius = 120) {
  const features = segments?.features ?? [];
  if (!features.length) return { morning: 0, day: 0, evening: 0 };
  const mid = (f) => {
    const [[x0, y0], [x1, y1]] = [f.geometry.coordinates[0], f.geometry.coordinates.at(-1)];
    return haversine((x0 + x1) / 2, (y0 + y1) / 2, point.lon, point.lat);
  };
  let near = features.filter((f) => mid(f) <= radius);
  if (!near.length) near = [features.reduce((best, f) => (mid(f) < mid(best) ? f : best))];
  const avg = (key) => r3(near.reduce((s, f) => s + f.properties[key], 0) / near.length);
  return { morning: avg('morning'), day: avg('day'), evening: avg('evening') };
}
