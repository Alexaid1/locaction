// Объекты OSM вокруг точки из своего слоя map/poi/ (снимок OSM, тот же, что у подложки).
// Без внешних сервисов: координаты пользователя никуда не уходят. Собирает tools/build_poi.py.

export const RADIUS = 800;
const BASE = new URL('../../map/poi/', import.meta.url);
const CELL_LAT = 0.02;
const CELL_LON = 0.04;

export function cellsAround(lat, lon, radius = RADIUS) {
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos(lat * Math.PI / 180));
  const out = [];
  for (let iy = Math.floor((lat - dLat) / CELL_LAT); iy <= Math.floor((lat + dLat) / CELL_LAT); iy++) {
    for (let ix = Math.floor((lon - dLon) / CELL_LON); ix <= Math.floor((lon + dLon) / CELL_LON); ix++) out.push(`${iy}_${ix}`);
  }
  return out;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Объекты OSM: время вышло')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const indexes = new WeakMap();
const defaultFetch = (...args) => fetch(...args);

async function getJson(fetchImpl, name) {
  const response = await fetchImpl(new URL(name, BASE));
  if (!response.ok) throw new Error(`Объекты OSM: HTTP ${response.status}`);
  return response.json();
}

function toElement([lon, lat, tag, name, ref]) {
  const [key, value] = tag.split('=');
  const tags = { [key]: value };
  if (name) tags.name = name;
  return { type: ref[0] === 'w' ? 'way' : 'node', id: Number(ref.slice(1)), lat, lon, tags };
}

// Возвращает объекты в формате элементов Overpass и дату снимка OSM.
export async function loadOsm(lat, lon, { fetchImpl = defaultFetch, timeoutMs = 12000 } = {}) {
  return withTimeout((async () => {
    if (!indexes.has(fetchImpl)) indexes.set(fetchImpl, getJson(fetchImpl, 'index.json').catch((e) => { indexes.delete(fetchImpl); throw e; }));
    const index = await indexes.get(fetchImpl);
    const available = new Set(index.cells);
    const wanted = cellsAround(lat, lon).filter((cell) => available.has(cell));
    const rows = (await Promise.all(wanted.map((cell) => getJson(fetchImpl, `${cell}.json`)))).flat();
    return { elements: rows.map(toElement), snapshot: index.snapshot };
  })(), timeoutMs);
}
