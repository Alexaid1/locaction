// Объекты OSM в радиусе точки через бесплатный Overpass API. Только для временного расчёта.
import { categoryById } from './osm-categories.mjs';

export const RADIUS = 800;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

// Что нужно для демо-индекса v2 и карты влияния кроме конкурентов.
export const CONTEXT = [
  ['railway', ['subway_entrance']],
  ['highway', ['bus_stop']],
  ['public_transport', ['platform']],
  ['office', null],
  ['shop', ['supermarket', 'mall']],
  ['leisure', ['fitness_centre', 'sports_centre']],
  ['amenity', ['clinic', 'hospital', 'doctors', 'university', 'college']],
];

const escape = (value) => value.replace(/[\\^$.*+?()[\]{}|"]/g, '\\$&');
const selector = ([key, values], around) => values
  ? `nwr${around}["${key}"~"^(${values.map(escape).join('|')})$"];`
  : `nwr${around}["${key}"];`;

export function buildQuery(lat, lon, categoryId) {
  const around = `(around:${RADIUS},${lat.toFixed(6)},${lon.toFixed(6)})`;
  const competitors = categoryById.get(categoryId)?.osm ?? [];
  const parts = [...competitors, ...CONTEXT].map((rule) => selector(rule, around));
  return `[out:json][timeout:10];(${parts.join('')});out center tags;`;
}

function deadline(ms) {
  let timer;
  const promise = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Overpass: время вышло')), ms); });
  return { promise, clear: () => clearTimeout(timer) };
}

export async function fetchOsm(lat, lon, categoryId, { timeoutMs = 12000, fetchImpl = (...args) => fetch(...args) } = {}) {
  const body = new URLSearchParams({ data: buildQuery(lat, lon, categoryId) });
  const timeout = deadline(timeoutMs);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let lastError = new Error('Overpass недоступен');
  try {
    for (const endpoint of ENDPOINTS) {
      try {
        const response = await Promise.race([
          fetchImpl(endpoint, { method: 'POST', body, signal: controller?.signal }),
          timeout.promise,
        ]);
        if (!response.ok) { lastError = new Error(`Overpass: HTTP ${response.status}`); continue; }
        const data = await Promise.race([response.json(), timeout.promise]);
        if (!Array.isArray(data?.elements)) { lastError = new Error('Overpass: пустой ответ'); continue; }
        return data.elements;
      } catch (error) {
        lastError = error;
        if (error.message === 'Overpass: время вышло') break;
      }
    }
    throw lastError;
  } finally {
    timeout.clear();
    controller?.abort();
  }
}
