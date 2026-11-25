import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { card as stubCard } from '../api/stub/index.mjs';
import { scorePlace, toObjects } from '../api/stub/demo-index.mjs';
import { buildFlows, localIntensity } from '../api/stub/flows.mjs';
import { sampleCard } from '../api/stub/sample.mjs';
import { fetchOsm } from '../api/stub/overpass.mjs';
import { CATEGORIES } from '../api/stub/osm-categories.mjs';
import { haversine } from '../app/search.mjs';
import { assertValid } from './contract.mjs';

const overpass = JSON.parse(readFileSync('tests/fixtures/overpass-dubravnaya.json', 'utf8'));
const roads = JSON.parse(readFileSync('tests/fixtures/roads-dubravnaya.json', 'utf8'));
const stations = JSON.parse(readFileSync('map/metro.json', 'utf8'));
const point = { lat: 55.845589, lon: 37.355637 };
const fixedNow = () => new Date('2026-11-25T12:00:00Z');
const params = (category_id) => ({ schema: 'locaction.params/1', category_id, format: null, avg_check_rub: null, hours: null,
  audience: [], area_m2: null, ownership: null, source: 'form', raw_text: null, missing: ['format'] });
const req = (category) => ({ point, building: { osm: 'way/31543627', unom: null }, params: params(category) });
const hints = { roads, address: 'Дубравная улица, 36', kind: 'residential' };
const fixtureFetch = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const opts = { fetchImpl: fixtureFetch(overpass), now: fixedNow, stations, preview: null };
const objects = toObjects(overpass.elements);

test('stub card from fixture is valid and uses demo index v2', async () => {
  const card = await stubCard(req('food.coffee'), hints, opts);
  assertValid('card', card);
  assert.equal(card.engine.kind, 'demo_index_v2');
  assert.equal(card.forecast.status, 'not_validated');
  assert.equal(card.forecast.probability, null);
  assert.equal(card.flows.status, 'illustration');
  assert.equal(card.explain.price_rub, null);
  assert.equal(card.point.address, 'Дубравная улица, 36');
  assert.ok(card.map.points.length > 0 && card.map.points.every((p) => p.source === 'osm'));
  assert.deepEqual(card.place.indicators.map((i) => i.id), ['metro_dist_m', 'competitors_300', 'stops_300', 'offices_500', 'attractors_300']);
});

test('demo index matches methodology for known counts', () => {
  const { place } = scorePlace(objects, point, 'food.coffee', stations);
  const value = (id) => place.indicators.find((i) => i.id === id).value;
  assert.deepEqual([value('competitors_300'), value('stops_300'), value('offices_500'), value('attractors_300')], [2, 4, 3, 2]);
  const metro = value('metro_dist_m');
  assert.ok(Math.abs(metro - 260) <= 2, `metro ${metro}`);
  const expected = 25 * 0.8 + 35 * ((700 - metro) / 625) + 15 * (4 / 6) + 10 * (3 / 20) + 15 * (2 / 12);
  assert.equal(place.score.value, Math.round(expected * 10) / 10);
});

test('competitors follow category: pharmacy ignores cafes', () => {
  const { place, points } = scorePlace(objects, point, 'retail.pharmacy', stations);
  assert.equal(place.indicators.find((i) => i.id === 'competitors_300').value, 0);
  assert.equal(points.filter((p) => p.kind === 'competitor').length, 1);
});

test('supermarket category treats supermarkets as competitors, not anchors', () => {
  const { place } = scorePlace(objects, point, 'retail.supermarket', stations);
  const value = (id) => place.indicators.find((i) => i.id === id).value;
  assert.equal(value('competitors_300'), 1);
  assert.equal(value('attractors_300'), 1);
});

test('without a metro entrance nearby the nearest station is used', () => {
  const noEntrance = objects.filter((o) => o.tags.railway !== 'subway_entrance');
  const { place } = scorePlace(noEntrance, point, 'food.coffee', stations);
  assert.ok(place.indicators.find((i) => i.id === 'metro_dist_m').value > 0);
});

test('every category has competitor tags', () => {
  assert.equal(CATEGORIES.length, 28);
  for (const c of CATEGORIES) assert.ok(c.osm?.length, c.id);
});

test('flows stay inside radius and are normalised', () => {
  const { points } = scorePlace(objects, point, 'food.coffee', stations);
  const fc = buildFlows(roads, point, points);
  assert.ok(fc.features.length > 0 && fc.features.length <= 2000);
  const all = fc.features.flatMap((f) => [f.properties.morning, f.properties.day, f.properties.evening]);
  assert.equal(Math.max(...all), 1);
  assert.ok(all.every((v) => v >= 0 && v <= 1));
  assert.ok(fc.features.every((f) => f.geometry.coordinates.every(([x, y]) => haversine(x, y, point.lon, point.lat) <= 820)));
  const local = localIntensity(fc, point);
  assert.ok(local.morning > 0 && local.day > 0 && local.evening > 0);
});

test('flows near the metro are stronger in the morning than far away', () => {
  const { points } = scorePlace(objects, point, 'food.coffee', stations);
  const fc = buildFlows(roads, point, points);
  const metro = points.find((p) => p.kind === 'metro');
  const near = fc.features.filter((f) => haversine(...f.geometry.coordinates[0], metro.lon, metro.lat) < 100);
  const far = fc.features.filter((f) => haversine(...f.geometry.coordinates[0], metro.lon, metro.lat) > 700);
  const avg = (list) => list.reduce((s, f) => s + f.properties.morning, 0) / list.length;
  assert.ok(near.length && far.length && avg(near) > avg(far));
});

test('overpass failure falls back to sample card within timeout', async () => {
  const hang = () => new Promise(() => {});
  const t0 = Date.now();
  const card = await stubCard(req('food.coffee'), hints, { ...opts, fetchImpl: hang, timeoutMs: 50 });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(card.engine.kind, 'stub');
  assertValid('card', card);
});

test('overpass 429 on both mirrors is a failure', async () => {
  let calls = 0;
  const busy = async () => { calls++; return { ok: false, status: 429, json: async () => ({}) }; };
  await assert.rejects(fetchOsm(point.lat, point.lon, 'food.coffee', { fetchImpl: busy, timeoutMs: 500 }));
  assert.equal(calls, 2);
});

test('point outside Moscow is out_of_area', async () => {
  await assert.rejects(stubCard({ ...req('food.coffee'), point: { lat: 59.93, lon: 30.31 } }, {}, opts), { code: 'out_of_area' });
});

test('card without category is bad_params', async () => {
  await assert.rejects(stubCard(req(null), hints, opts), { code: 'bad_params' });
});

test('validated preview has probability inside interval', async () => {
  const offline = sampleCard(req('food.coffee'), hints, { validated: true, now: fixedNow });
  assertValid('card', offline);
  assert.equal(offline.forecast.status, 'validated');
  const live = await stubCard(req('food.coffee'), hints, { ...opts, preview: 'validated' });
  assertValid('card', live);
  assert.equal(live.forecast.status, 'validated');
  assert.equal(live.engine.version, 'preview-validated');
});

test('card id is stable for the same point and category', async () => {
  const a = await stubCard(req('food.coffee'), hints, opts);
  const b = await stubCard(req('food.coffee'), hints, opts);
  const c = await stubCard(req('food.bakery'), hints, opts);
  assert.equal(a.card_id, b.card_id);
  assert.notEqual(a.card_id, c.card_id);
});
