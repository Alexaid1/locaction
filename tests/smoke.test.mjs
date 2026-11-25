import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaths, spawnWeights, positionAt, particleBudget, bezier } from '../app/smoke-math.mjs';
import { example } from './contract.mjs';

const segments = example('card-validated.json').flows.segments;
const paths = buildPaths(segments);

test('paths have positive length', () => {
  assert.equal(paths.length, 2);
  assert.ok(paths.every((p) => p.length_m > 0 && p.cumulative[0] === 0 && p.cumulative.at(-1) === p.length_m));
});

test('spawn weights follow period intensity', () => {
  const w = spawnWeights(paths, segments, 'morning');
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-6);
  assert.ok(w[0] > w[1]);
  const evening = spawnWeights(paths, segments, 'evening');
  assert.notDeepEqual([...w], [...evening]);
});

test('spawn weights survive all-zero intensity', () => {
  const flat = { type: 'FeatureCollection', features: segments.features.map((f) => ({ ...f, properties: { morning: 0, day: 0, evening: 0 } })) };
  const w = spawnWeights(buildPaths(flat), flat, 'day');
  assert.ok(w.every((v) => v === 0));
});

test('positionAt walks along the polyline', () => {
  const p = paths[0];
  assert.deepEqual(positionAt(p, 0), p.coords[0]);
  assert.deepEqual(positionAt(p, p.length_m), p.coords.at(-1));
  const mid = positionAt(p, p.cumulative[1]);
  assert.ok(Math.abs(mid[0] - p.coords[1][0]) < 1e-9 && Math.abs(mid[1] - p.coords[1][1]) < 1e-9);
});

test('particle budget grows with intensity and is capped', () => {
  assert.equal(particleBudget(0), 40);
  assert.ok(particleBudget(0.5) > particleBudget(0.2));
  assert.equal(particleBudget(5), 700);
});

test('bezier endpoints', () => {
  assert.deepEqual(bezier({ x: 0, y: 0 }, { x: 5, y: -10 }, { x: 10, y: 0 }, 0), { x: 0, y: 0 });
  assert.deepEqual(bezier({ x: 0, y: 0 }, { x: 5, y: -10 }, { x: 10, y: 0 }, 1), { x: 10, y: 0 });
});
