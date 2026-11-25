// Заглушка POST /v1/card: временный расчёт по OSM (демо-индекс v2) и иллюстрация потоков.
import { ApiError } from '../errors.mjs';
import { categoryById } from './osm-categories.mjs';
import { fetchOsm, RADIUS } from './overpass.mjs';
import { scorePlace, toObjects } from './demo-index.mjs';
import { buildFlows } from './flows.mjs';
import { sampleParts, validatedForecast } from './sample.mjs';

export const BOUNDS = { minLat: 55.1, maxLat: 56.1, minLon: 36.8, maxLon: 38.0 };
const METRO_URL = new URL('../../map/metro.json', import.meta.url);

export const FIELD_CHECKS = [
  'Посчитайте прохожих у входа утром и вечером в будни',
  'Пройдите от метро до двери: переходы, видимость вывески',
  'Уточните аренду, мощность, воду и условия для вывески',
];

function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 6);
}

const today = (now) => now().toISOString().slice(0, 10);

async function loadStations() {
  try {
    const response = await fetch(METRO_URL);
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

function previewMode() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('forecast');
  } catch {
    return null;
  }
}

export function checkRequest(request) {
  const { lat, lon } = request?.point ?? {};
  if (!(lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon)) {
    throw new ApiError('out_of_area', 'Пока считаем только Москву');
  }
  if (!categoryById.has(request.params?.category_id)) throw new ApiError('bad_params', 'Выберите тип бизнеса');
}

export function assemble(request, hints, parts, now) {
  const { point, params } = request;
  const date = today(now);
  const building = request.building ? {
    osm: request.building.osm ?? null, unom: request.building.unom ?? null,
    kind: hints?.kind ?? 'unknown', levels: null, year: null,
  } : null;
  return {
    schema: 'locaction.card/1',
    card_id: `c_${date.replaceAll('-', '')}_${hash(`${point.lat.toFixed(5)},${point.lon.toFixed(5)},${params.category_id}`)}`,
    created_at: now().toISOString(),
    point: { lat: +point.lat.toFixed(6), lon: +point.lon.toFixed(6), address: hints?.address ?? null, building, district: null, adm_area: null },
    params,
    engine: parts.engine,
    place: parts.place,
    forecast: parts.forecast ?? {
      status: 'not_validated', horizon_months: 12, probability: null, interval: null, baseline: null, quality: null,
      drivers: [], message: 'Модель проходит проверку на истории закрытий',
    },
    flows: {
      status: 'illustration',
      label: 'иллюстрация по улицам, не замер',
      unit: 'people_per_hour',
      periods: [['morning', '07-10'], ['day', '10-17'], ['evening', '17-21']]
        .map(([id, hours]) => ({ id, hours, value: null, low: null, high: null, percentile_city: null })),
      segments: hints?.roads?.length ? buildFlows(hints.roads, point, parts.points) : null,
    },
    map: { radius_m: RADIUS, points: parts.points },
    field_checks: FIELD_CHECKS,
    limits: parts.limits,
    sources: [{ id: 'osm', name: 'OpenStreetMap', as_of: date, license: 'ODbL' }],
    explain: { available: true, price_rub: null },
  };
}

export async function stubCard(request, hints = {}, opts = {}) {
  const { fetchImpl, timeoutMs = 12000, now = () => new Date() } = opts;
  checkRequest(request);
  const preview = opts.preview === undefined ? previewMode() : opts.preview;
  const { point, params } = request;
  const stations = opts.stations ?? await loadStations();

  let parts;
  try {
    const elements = await fetchOsm(point.lat, point.lon, params.category_id, { timeoutMs, ...(fetchImpl && { fetchImpl }) });
    const { place, points } = scorePlace(toObjects(elements), point, params.category_id, stations);
    parts = {
      place, points,
      engine: { kind: 'demo_index_v2', version: 'demo-v2', features_version: null, data_as_of: today(now) },
      limits: ['Временный расчёт по OpenStreetMap, не модель', 'Выручка и аренда в расчёт не входят', 'Потоки - иллюстрация по улицам, не замер'],
    };
  } catch {
    parts = sampleParts(point, now);
  }
  if (preview === 'validated') {
    parts.forecast = validatedForecast(parts.place);
    parts.engine = { ...parts.engine, version: 'preview-validated' };
    parts.limits = ['Пример состояния: прогноз не настоящий', ...parts.limits].slice(0, 6);
  }
  return assemble(request, hints, parts, now);
}
