import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadOsm, cellsAround } from '../api/stub/osm-local.mjs';
import { CATEGORIES } from '../api/stub/osm-categories.mjs';

const index = JSON.parse(readFileSync('map/poi/index.json', 'utf8'));
const fileFetch = (log = []) => async (url) => {
  const name = String(url).split('/').at(-1);
  log.push(name);
  try { const body = JSON.parse(readFileSync(`map/poi/${name}`, 'utf8')); return { ok: true, status: 200, json: async () => body }; }
  catch { return { ok: false, status: 404, json: async () => null }; }
};

test('cellsAround covers 800 m with at most 4 cells', () => {
  const cells = cellsAround(55.845589, 37.355637, 800);
  assert.ok(cells.length >= 1 && cells.length <= 4);
  assert.ok(cells.includes(`${Math.floor(55.845589 / 0.02)}_${Math.floor(37.355637 / 0.04)}`));
});

test('loadOsm returns Overpass-like elements around Dubravnaya 36', async () => {
  const log = [];
  const { elements, snapshot } = await loadOsm(55.845589, 37.355637, { fetchImpl: fileFetch(log) });
  assert.equal(snapshot, '2026-11-23');
  assert.ok(elements.length > 50);
  const el = elements[0];
  assert.ok(['node', 'way'].includes(el.type) && Number.isFinite(el.id) && Number.isFinite(el.lat) && Number.isFinite(el.lon));
  assert.equal(Object.keys(el.tags).filter((k) => k !== 'name').length, 1);
  assert.ok(elements.some((e) => e.tags.railway === 'subway_entrance'));
  assert.equal(log[0], 'index.json');
  assert.ok(log.length <= 5);
});

test('loadOsm fails when the index is missing', async () => {
  await assert.rejects(loadOsm(55.8, 37.4, { fetchImpl: async () => ({ ok: false, status: 404, json: async () => null }) }));
});

test('loadOsm gives up after timeout', async () => {
  const t0 = Date.now();
  await assert.rejects(loadOsm(55.8, 37.4, { fetchImpl: () => new Promise(() => {}), timeoutMs: 50 }));
  assert.ok(Date.now() - t0 < 1000);
});

test('poi layer contains every competitor tag of every category', () => {
  const tags = new Set(index.tags);
  for (const c of CATEGORIES) for (const [key, values] of c.osm) for (const v of values) assert.ok(tags.has(`${key}=${v}`), `${c.id} ${key}=${v}`);
});
