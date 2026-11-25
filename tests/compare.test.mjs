import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStore, compareModel } from '../app/compare-model.mjs';
import { example } from './contract.mjs';

const card = example('card-validated.json');
const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
};

test('compare store keeps five unique cards, newest last', () => {
  const s = compareStore(memoryStorage());
  for (let i = 0; i < 7; i++) s.add({ ...card, card_id: `c_${i}xxxxx` });
  s.add({ ...card, card_id: 'c_6xxxxx' });
  const ids = s.list().map((c) => c.card_id);
  assert.equal(ids.length, 5);
  assert.deepEqual(ids, ['c_2xxxxx', 'c_3xxxxx', 'c_4xxxxx', 'c_5xxxxx', 'c_6xxxxx']);
});

test('compare store survives throwing storage', () => {
  const s = compareStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.equal(s.add(card).length, 1);
  assert.equal(s.list().length, 1);
});

test('compare store persists between instances and removes', () => {
  const storage = memoryStorage();
  compareStore(storage).add(card);
  const again = compareStore(storage);
  assert.equal(again.list().length, 1);
  again.remove(card.card_id);
  assert.equal(compareStore(storage).list().length, 0);
});

test('compare store ignores broken saved data', () => {
  const storage = memoryStorage();
  storage.setItem('locaction.compare.v1', '{not json');
  assert.deepEqual(compareStore(storage).list(), []);
});

test('compare model shows score, forecast and top indicators', () => {
  const [row] = compareModel([card, example('card-not-validated.json')]);
  assert.equal(row.address, 'Дубравная улица, 36');
  assert.equal(row.score, 72);
  assert.equal(row.forecast, 84);
  assert.equal(row.top.length, 3);
  assert.equal(compareModel([example('card-not-validated.json')])[0].forecast, null);
});
