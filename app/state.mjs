// Состояние приложения в адресе страницы: #s=<base64url(JSON)>. Ссылкой можно поделиться.
import { categoryById } from '../api/stub/osm-categories.mjs';
import { inBounds } from '../api/bounds.mjs';

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

function cleanBuilding(b) {
  if (!b || typeof b !== 'object' || typeof b.osm !== 'string') return null;
  const { osm, unom = null, address = null, kind = 'unknown', footprint = null } = b;
  return { osm, unom, address, kind, footprint };
}

function cleanParams(p) {
  if (!p || typeof p !== 'object' || p.schema !== 'locaction.params/1') return null;
  if (categoryById.has(p.category_id)) return p;
  const missing = Array.isArray(p.missing) ? p.missing : [];
  return { ...p, category_id: null, missing: missing.includes('category_id') ? missing : ['category_id', ...missing] };
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
