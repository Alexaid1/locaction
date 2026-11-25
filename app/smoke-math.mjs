// Геометрия «дыма» без DOM: пути по отрезкам потоков, веса появления частиц, позиция вдоль пути.
import { haversine } from './search.mjs';

export function buildPaths(segments) {
  return (segments?.features ?? []).map((feature) => {
    const coords = feature.geometry.coordinates;
    const cumulative = [0];
    for (let i = 1; i < coords.length; i++) {
      cumulative.push(cumulative[i - 1] + haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
    }
    return { coords, cumulative, length_m: cumulative.at(-1) };
  });
}

export function spawnWeights(paths, segments, period) {
  const features = segments?.features ?? [];
  const raw = new Float64Array(paths.length);
  let total = 0;
  for (let i = 0; i < paths.length; i++) {
    raw[i] = (features[i]?.properties?.[period] ?? 0) * paths[i].length_m;
    total += raw[i];
  }
  if (total > 0) for (let i = 0; i < raw.length; i++) raw[i] /= total;
  return raw;
}

export function positionAt(path, s) {
  const { coords, cumulative } = path;
  if (s <= 0) return coords[0];
  if (s >= path.length_m) return coords.at(-1);
  let i = 1;
  while (cumulative[i] < s) i++;
  const span = cumulative[i] - cumulative[i - 1] || 1;
  const t = (s - cumulative[i - 1]) / span;
  const [x0, y0] = coords[i - 1];
  const [x1, y1] = coords[i];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

export const particleBudget = (meanIntensity) => Math.min(700, Math.round(40 + 900 * Math.max(0, meanIntensity)));

export function bezier(a, c, b, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}
