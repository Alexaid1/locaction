import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, shardKey, rank, nearestMetro, createSearch, shardFile } from '../app/search.mjs';

test('normalize drops street types and folds ё', () => {
  assert.deepEqual(normalize('ул. Дубравная, д. 36, корп. 2'), ['дубравная', '36', 'к2']);
  assert.deepEqual(normalize('Дубравная улица 36к2'), ['дубравная', '36', 'к2']);
  assert.deepEqual(normalize('Дубравная улица, 36 к2'), ['дубравная', '36', 'к2']);
  assert.deepEqual(normalize('Шоссе Энтузиастов'), ['энтузиастов']);
  assert.deepEqual(normalize('Мясницкая, 24/7 стр. 1'), ['мясницкая', '24/7', 'с1']);
  assert.equal(normalize('Тёплый Стан')[0], 'теплый');
});

test('shardKey is first letter of first word token', () => {
  assert.equal(shardKey('36 Дубравная'), 'ду');
  assert.equal(shardKey('36 к2 Дубравная'), 'ду');
  assert.equal(shardKey('1-я Тверская-Ямская улица, 10'), 'тв');
  assert.equal(shardKey('Д'), null);
  assert.equal(shardKey('  '), null);
  assert.equal(shardKey('36'), null);
});

const row = (a, o) => ({ a, x: 1, y: 1, o });

test('rank prefers exact house, any word order', () => {
  const rows = [row('Дубравная улица, 36', 'way/1'), row('Дубравная улица, 36 к2', 'way/2'), row('Дубравная улица, 38', 'way/3')];
  assert.equal(rank('36 дубравная', rows)[0].o, 'way/1');
  assert.equal(rank('Дубравная 36 к2', rows)[0].o, 'way/2');
  assert.equal(rank('дубравная 3', rows).length, 3);
  assert.deepEqual(rank('Профсоюзная', rows), []);
});

test('rank honours limit', () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(`Дубравная улица, ${i + 1}`, `way/${i}`));
  assert.equal(rank('дубравная', rows).length, 6);
  assert.equal(rank('дубравная', rows, 3).length, 3);
});

test('nearestMetro returns rounded distance', () => {
  const st = [{ name: 'Митино', lon: 37.3618, lat: 55.8459 }, { name: 'Волоколамская', lon: 37.3825, lat: 55.8353 }];
  const near = nearestMetro(37.3618, 55.8450, st);
  assert.equal(near.name, 'Митино');
  assert.equal(near.distance_m, 100);
});

test('createSearch loads only the needed shard and caches it', async () => {
  const calls = [];
  const files = {
    'index.json': { keys: ['ду'], count: 1 },
    [shardFile('ду')]: [row('Дубравная улица, 36', 'way/1')],
  };
  const fetchImpl = async (url) => {
    const name = String(url).split('/').at(-1);
    calls.push(name);
    return { ok: name in files, json: async () => files[name] };
  };
  const search = createSearch(new URL('http://x/map/addresses/'), fetchImpl);
  assert.equal((await search.suggest('дубравная 36'))[0].o, 'way/1');
  await search.suggest('дубравная 3');
  assert.deepEqual(await search.suggest('профсоюзная'), []);
  assert.deepEqual(calls, ['index.json', shardFile('ду')]);
});
