// Состояние приложения в адресе страницы: #s=<base64url(JSON)>. Ссылкой можно поделиться.
import { categoryById } from '../api/stub/osm-categories.mjs';
import { inBounds } from '../api/bounds.mjs';
import { AUDIENCE, DAYS, FORMATS, OWNERSHIP } from './form-model.mjs';
import { missingOf } from '../api/stub/parse.mjs';

const SCREENS = new Set(['home', 'map', 'form', 'result', 'compare']);
const NEEDS_POINT = new Set(['map', 'form', 'result']);
const round5 = (value) => Math.round(value * 1e5) / 1e5;

function toBase64Url(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

export function encode(state) {
  const out = { ...state };
  if (state.point) out.point = { lat: round5(state.point.lat), lon: round5(state.point.lon) };
  return `#s=${toBase64Url(JSON.stringify(out))}`;
}

const inMoscow = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && inBounds(p);

// Всё, что пришло из ссылки, собирается заново по типам и спискам контракта: ничего лишнего и ничего непроверенного.
const KINDS = ['residential', 'commercial', 'mixed', 'other', 'unknown'];
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const oneOf = (v, list) => (list.some(([id]) => id === v) ? v : null);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOSE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

function cleanBuilding(b) {
  if (!b || typeof b !== 'object' || typeof b.osm !== 'string' || !/^(way|relation|node)\/\d+$/.test(b.osm)) return null;
  return {
    osm: b.osm, unom: str(b.unom, 20), address: str(b.address),
    kind: KINDS.includes(b.kind) ? b.kind : 'unknown', footprint: num(b.footprint, 0, 1e6),
  };
}

function cleanHours(h) {
  if (!h || typeof h !== 'object' || !TIME.test(h.open ?? '') || !CLOSE.test(h.close ?? '')) return null;
  return { open: h.open, close: h.close, days: oneOf(h.days, DAYS) ?? 'daily' };
}

function cleanParams(p) {
  if (!p || typeof p !== 'object' || p.schema !== 'locaction.params/1') return null;
  const avg = num(p.avg_check_rub, 0, 1_000_000);
  const params = {
    schema: 'locaction.params/1',
    category_id: categoryById.has(p.category_id) ? p.category_id : null,
    format: oneOf(p.format, FORMATS),
    avg_check_rub: avg === null ? null : Math.round(avg),
    hours: cleanHours(p.hours),
    audience: AUDIENCE.map(([id]) => id).filter((id) => Array.isArray(p.audience) && p.audience.includes(id)),
    area_m2: num(p.area_m2, 1, 10000),
    ownership: oneOf(p.ownership, OWNERSHIP),
    source: p.source === 'text' ? 'text' : 'form',
    raw_text: str(p.raw_text, 2000),
  };
  params.missing = missingOf(params);
  return params;
}

export function decode(hash) {
  const match = /^#s=([A-Za-z0-9_-]+)$/.exec(hash ?? '');
  if (!match) return null;
  let raw;
  try {
    raw = JSON.parse(fromBase64Url(match[1]));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || !SCREENS.has(raw.screen)) return null;
  if (!NEEDS_POINT.has(raw.screen)) return { screen: raw.screen };
  if (!inMoscow(raw.point)) return null;
  const out = { screen: raw.screen, point: { lat: raw.point.lat, lon: raw.point.lon } };
  if ('building' in raw) out.building = cleanBuilding(raw.building);
  if ('params' in raw) out.params = cleanParams(raw.params);
  if (out.screen === 'result' && !out.params?.category_id) out.screen = 'form';
  return out;
}
