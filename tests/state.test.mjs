import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from '../app/state.mjs';
import { example } from './contract.mjs';

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
