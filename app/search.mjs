// Поиск адреса по своему индексу адресов OSM (map/addresses/), без внешнего геокодера.
// Правила нормализации повторены в tools/build_lookup.py: менять оба места вместе.

const STREET_TYPES = new Set([
  'улица', 'ул', 'проспект', 'пр', 'пр-т', 'просп', 'переулок', 'пер', 'шоссе', 'ш', 'бульвар', 'б-р', 'бул',
  'площадь', 'пл', 'проезд', 'пр-д', 'набережная', 'наб', 'тупик', 'туп', 'аллея', 'линия', 'квартал', 'кв-л',
  'дом', 'д', 'владение', 'вл', 'город', 'г', 'москва',
]);
const BUILDING = { к: 'к', корп: 'к', корпус: 'к', с: 'с', стр: 'с', строение: 'с' };
const GLUED = /^(\d+[а-я]?(?:\/\d+[а-я]?)?)(к|корп|с|стр)(\d+)$/;
const SUBPART = /^[кс]\d/;

export function normalize(text) {
  const raw = String(text).toLowerCase().replaceAll('ё', 'е').split(/[\s,.;:()"«»№]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const token = raw[i];
    const glued = token.match(GLUED);
    if (glued) {
      out.push(glued[1], BUILDING[glued[2]] + glued[3]);
    } else if (token in BUILDING && /^\d+$/.test(raw[i + 1] ?? '')) {
      out.push(BUILDING[token] + raw[++i]);
    } else if (!STREET_TYPES.has(token)) {
      out.push(token);
    }
  }
  return out;
}

const isWord = (token) => /^[a-zа-я]/.test(token) && !SUBPART.test(token);

// Часть индекса - по первым двум буквам первого слова названия улицы.
export function shardKey(text) {
  const word = normalize(text).find(isWord);
  return word && word.length >= 2 ? word.slice(0, 2) : null;
}

export const shardFile = (key) => `${[...key].map((c) => c.codePointAt(0).toString(16)).join('-')}.json`;

const tokensOf = (row) => (row._t ??= normalize(row.a));

export function rank(query, rows, limit = 6) {
  const wanted = normalize(query);
  if (!wanted.length) return [];
  const scored = [];
  for (const row of rows) {
    const have = tokensOf(row);
    let score = 0;
    const used = new Set();
    let ok = true;
    for (const q of wanted) {
      const exact = have.findIndex((t, i) => !used.has(i) && t === q);
      const index = exact >= 0 ? exact : have.findIndex((t, i) => !used.has(i) && t.startsWith(q));
      if (index < 0) { ok = false; break; }
      used.add(index);
      if (exact >= 0) score += /^\d/.test(q) ? 10 : 2;
    }
    if (!ok) continue;
    score -= (have.length - used.size) * 3;
    scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || a.row.a.length - b.row.a.length || a.row.a.localeCompare(b.row.a, 'ru'));
  return scored.slice(0, limit).map(({ row }) => row);
}

const EARTH = 6371008.8;
const rad = (deg) => deg * Math.PI / 180;

export function haversine(lon1, lat1, lon2, lat2) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(a));
}

export function nearestMetro(lon, lat, stations) {
  let best = null;
  for (const station of stations) {
    const d = haversine(lon, lat, station.lon, station.lat);
    if (!best || d < best.d) best = { station, d };
  }
  if (!best) return null;
  const { name, lon: x, lat: y } = best.station;
  return { name, distance_m: Math.round(best.d / 10) * 10, lon: x, lat: y };
}

export function createSearch(baseUrl, fetchImpl = fetch) {
  const shards = new Map();
  let index;
  const load = async (name) => {
    const response = await fetchImpl(new URL(name, baseUrl));
    if (!response.ok) throw new Error(`Адреса: HTTP ${response.status}`);
    return response.json();
  };
  return {
    async suggest(query, limit) {
      const key = shardKey(query);
      if (!key) return [];
      index ??= load('index.json').catch((error) => { index = undefined; throw error; });
      const { keys } = await index;
      if (!keys.includes(key)) return [];
      if (!shards.has(key)) shards.set(key, load(shardFile(key)).catch((error) => { shards.delete(key); throw error; }));
      return rank(query, await shards.get(key), limit);
    },
  };
}
