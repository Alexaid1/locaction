import test from 'node:test';
import assert from 'node:assert/strict';
import { unknownNumbers } from '../api/numbers.mjs';
import { explain as stubExplain } from '../api/stub/explain.mjs';
import { assertValid, example } from './contract.mjs';

test('unknownNumbers catches invented numbers and accepts percent of probability', () => {
  const card = example('card-validated.json');
  const ex = example('explain-response.json');
  assert.deepEqual(unknownNumbers(ex, card), []);
  ex.checks[0].text += ' Аренда 15 000 ₽, шанс 84%.';
  assert.deepEqual(unknownNumbers(ex, card), ['15000']);
});

test('stub explain uses only card numbers', async () => {
  for (const name of ['card-not-validated.json', 'card-validated.json']) {
    const card = example(name);
    const ex = await stubExplain(card);
    assertValid('explain', ex);
    assert.deepEqual(unknownNumbers(ex, card), [], name);
    assert.ok(ex.strengths.length >= 1 && ex.weaknesses.length >= 1 && ex.checks.length >= 1, name);
    assert.equal(ex.card_id, card.card_id);
  }
});

test('stub explain points to indicators of the card', async () => {
  const card = example('card-validated.json');
  const ids = new Set(card.place.indicators.map((i) => i.id));
  const ex = await stubExplain(card);
  for (const item of [...ex.strengths, ...ex.weaknesses, ...ex.checks])
    for (const id of item.indicator_ids) assert.ok(ids.has(id), id);
});

test('stub explain says plainly when nothing is weak', async () => {
  const card = example('card-not-validated.json');
  card.place.indicators = card.place.indicators.map((i) => ({ ...i, effect: 'plus' }));
  const ex = await stubExplain(card);
  assert.equal(ex.weaknesses.length, 1);
  assert.equal(ex.weaknesses[0].text, 'Явных слабых мест в окружении нет. На осмотре проверьте вход, витрину и аренду.');
});
