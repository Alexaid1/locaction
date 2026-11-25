import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../app/state.mjs';
import { example, assertValid } from './contract.mjs';

const sampleParams = example('parse-response.json').params;

test('state round-trips through hash', () => {
  const s = { screen: 'result', point: { lat: 55.84528, lon: 37.36114 }, building: null, params: sampleParams };
  assert.deepEqual(decode(encode(s)), s);
  const b = { screen: 'form', point: { lat: 55.84528, lon: 37.36114 },
    building: { osm: 'way/1', unom: null, address: 'Дубравная улица, 36', kind: 'residential', footprint: 812 }, params: null };
  assert.deepEqual(decode(encode(b)), b);
});

test('encode rounds coordinates to 5 digits and starts with #s=', () => {
  const hash = encode({ screen: 'map', point: { lat: 55.845589123, lon: 37.355637987 } });
  assert.ok(hash.startsWith('#s='));
  assert.deepEqual(decode(hash).point, { lat: 55.84559, lon: 37.35564 });
});

test('broken or foreign hash gives null', () => {
  for (const h of ['', '#', '#s=%%%', '#s=eyJ4IjoxfQ', '#foo=1', '#s=bnVsbA', undefined])
    assert.equal(decode(h), null, String(h));
});

test('point outside Moscow or unknown screen gives null', () => {
  assert.equal(decode(encode({ screen: 'result', point: { lat: 59.93, lon: 30.31 }, params: sampleParams })), null);
  assert.equal(decode(encode({ screen: 'party', point: { lat: 55.8, lon: 37.4 } })), null);
});

test('unknown category is dropped, screen falls back to form', () => {
  const s = decode(encode({ screen: 'result', point: { lat: 55.8, lon: 37.4 }, params: { ...sampleParams, category_id: 'x.y' } }));
  assert.equal(s.screen, 'form');
  assert.equal(s.params.category_id, null);
});

test('home and compare need no point', () => {
  assert.deepEqual(decode(encode({ screen: 'compare' })), { screen: 'compare' });
  assert.equal(decode(encode({ screen: 'form' })), null);
});

test('hostile or mistyped params from a link are rebuilt field by field', () => {
  const hostile = {
    schema: 'locaction.params/1', category_id: 'food.coffee', format: '<b>x</b>', avg_check_rub: '<img src=x onerror=alert(1)>',
    hours: { open: 8, close: '"><svg onload=alert(1)>', days: 'always' }, audience: ['x', 'commuters', '<i>'],
    area_m2: '"><img src=x onerror=alert(1)>', ownership: 'pirate', source: 'text', raw_text: 'a'.repeat(5000),
    missing: ['nope'], extra: '<script>',
  };
  const s = decode(encode({ screen: 'form', point: { lat: 55.8, lon: 37.4 }, building: null, params: hostile }));
  const p = s.params;
  assert.equal(p.category_id, 'food.coffee');
  assert.equal(p.format, null);
  assert.equal(p.avg_check_rub, null);
  assert.equal(p.hours, null);
  assert.deepEqual(p.audience, ['commuters']);
  assert.equal(p.area_m2, null);
  assert.equal(p.ownership, null);
  assert.equal(p.raw_text.length, 2000);
  assert.ok(!('extra' in p));
  assert.ok(p.missing.every((m) => ['format', 'avg_check_rub', 'hours', 'audience', 'area_m2', 'ownership', 'category_id'].includes(m)));
  assertValid('params', p);
});

test('valid hours and numbers from a link survive', () => {
  const p = decode(encode({ screen: 'form', point: { lat: 55.8, lon: 37.4 }, params: { ...sampleParams, area_m2: 40, hours: { open: '08:00', close: '24:00', days: 'weekdays' } } })).params;
  assert.equal(p.area_m2, 40);
  assert.deepEqual(p.hours, { open: '08:00', close: '24:00', days: 'weekdays' });
});

test('building fields from a link are typed', () => {
  const b = decode(encode({ screen: 'map', point: { lat: 55.8, lon: 37.4 }, building: { osm: 'way/1', unom: { x: 1 }, address: 5, kind: '<b>', footprint: '1e9' } })).building;
  assert.deepEqual(b, { osm: 'way/1', unom: null, address: null, kind: 'unknown', footprint: null });
  assert.equal(decode(encode({ screen: 'map', point: { lat: 55.8, lon: 37.4 }, building: { osm: '<img>' } })).building, null);
});
