import test from 'node:test';
import assert from 'node:assert/strict';
import { panelModel, kindsFor } from '../app/panel-model.mjs';
import { example } from './contract.mjs';

const plain = (text) => text.replace(/[  ]/g, ' ');

const validatedCard = example('card-validated.json');
const notValidatedCard = example('card-not-validated.json');

test('validated card shows percent and interval', () => {
  const m = panelModel(validatedCard);
  assert.deepEqual(m.forecast, { kind: 'validated', pct: 84, low: 71, high: 91, city: 79 });
});

test('not validated card hides percent', () => {
  const m = panelModel(notValidatedCard);
  assert.equal(m.forecast.kind, 'pending');
  assert.equal(m.forecast.message, 'Модель проходит проверку на истории закрытий');
  assert.ok(!JSON.stringify(m.forecast).includes('%'));
});

test('flows always carry label; illustration has no numbers', () => {
  const m = panelModel(notValidatedCard);
  assert.equal(m.flows.label, notValidatedCard.flows.label);
  assert.equal(m.flows.numbers, null);
  assert.deepEqual(m.flows.bars.map((b) => b.id), ['morning', 'day', 'evening']);
  assert.ok(m.flows.bars.every((b) => b.rel >= 0 && b.rel <= 1));
});

test('estimate flows give relative bars and a number line', () => {
  const m = panelModel(validatedCard);
  assert.deepEqual(m.flows.bars.map((b) => b.rel), [1, 600 / 1100, 850 / 1100]);
  assert.equal(plain(m.flows.numbers), '≈ 900-1 300 чел./ч утром');
});

test('stub engine and preview show banners', () => {
  assert.equal(panelModel({ ...notValidatedCard, engine: { ...notValidatedCard.engine, kind: 'stub' } }).banner, 'Примерные данные');
  assert.equal(panelModel({ ...validatedCard, engine: { ...validatedCard.engine, version: 'preview-validated' } }).banner, 'Пример состояния: прогноз не настоящий');
  assert.equal(panelModel(validatedCard).banner, null);
});

test('row values are formatted in Russian', () => {
  const m = panelModel(validatedCard);
  const row = m.rows.find((r) => r.id === 'pop_400');
  assert.equal(plain(row.value), '9 400 чел.');
  assert.equal(row.zone, '400 м');
  assert.equal(row.bar, 0.74);
  assert.equal(plain(m.rows.find((r) => r.id === 'metro_dist_m').value), '260 м');
});

test('title, subtitle and score ring', () => {
  const m = panelModel(validatedCard);
  assert.equal(m.title, 'Дубравная улица, 36');
  assert.equal(m.subtitle, 'Кофейня · навынос');
  assert.deepEqual(m.score, { value: 72, ring: 0.72, percentile: 68 });
});

test('indicator ids map to map point kinds', () => {
  assert.deepEqual(kindsFor('metro_dist_m'), ['metro']);
  assert.deepEqual(kindsFor('competitors_300'), ['competitor']);
  assert.deepEqual(kindsFor('osm_same_400'), ['competitor']);
  assert.deepEqual(kindsFor('anchor_supermarket_400'), ['anchor']);
  assert.deepEqual(kindsFor('pop_400'), []);
});
