import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPoints, legendItems } from '../app/poi-model.mjs';

const KY = 111320;
const at = (n, kind, effect = 'plus', strength = 0.5, name = null) => ({
  id: `osm:node/${n}-${kind}`, kind, name, lat: 55.8 + n / KY, lon: 37.4, distance_m: n, effect, strength, source: 'osm' });

test('close points of the same kind merge into one marker with a count', () => {
  const pts = [at(0, 'office', 'plus', 0.9, 'БЦ'), at(20, 'office'), at(30, 'office'), at(200, 'office'), at(10, 'competitor', 'minus')];
  const { shown } = groupPoints(pts);
  const offices = shown.filter((p) => p.kind === 'office');
  assert.equal(offices.length, 2);
  assert.equal(offices[0].count, 3);
  assert.equal(offices[0].name, 'БЦ');
  assert.equal(shown.find((p) => p.kind === 'competitor').count, 1);
});

test('markers are capped per kind; the rest become dots', () => {
  const pts = Array.from({ length: 30 }, (_, i) => at(i * 100, 'office', 'plus', 1 - i / 30));
  const { shown, rest } = groupPoints(pts);
  assert.equal(shown.length, 8);
  assert.equal(rest.length, 22);
});

test('legend lists kinds present with counts, metro first', () => {
  const items = legendItems([at(0, 'office'), at(500, 'metro'), at(900, 'office'), at(10, 'competitor', 'minus')]);
  assert.deepEqual(items.map((i) => [i.kind, i.count]), [['metro', 1], ['competitor', 1], ['office', 2]]);
  assert.equal(items[1].label, 'Конкуренты');
});
