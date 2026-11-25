import test from 'node:test';
import assert from 'node:assert/strict';
import { parse as stubParse } from '../api/stub/parse.mjs';
import { CATEGORIES } from '../api/stub/osm-categories.mjs';
import { assertValid } from './contract.mjs';
import { readFileSync } from 'node:fs';

test('parse finds coffee takeaway with check, hours, audience', async () => {
  const { params } = await stubParse('Кофейня навынос, чек около 350 ₽, с 7 до 21 без выходных, люди у метро и мамы с колясками');
  assert.equal(params.category_id, 'food.coffee');
  assert.equal(params.format, 'takeaway');
  assert.equal(params.avg_check_rub, 350);
  assert.deepEqual(params.hours, { open: '07:00', close: '21:00', days: 'daily' });
  assert.deepEqual([...params.audience].sort(), ['commuters', 'families']);
  assert.deepEqual([...params.missing].sort(), ['area_m2', 'ownership']);
  assert.equal(params.source, 'text');
  assertValid('parse', { params });
});

test('parse without business type gives null category', async () => {
  const { params } = await stubParse('Хочу что-нибудь открыть возле дома');
  assert.equal(params.category_id, null);
  assert.ok(params.missing.includes('category_id'));
  assertValid('parse', { params });
});

test('parse maps pickup, pharmacy, barbershop, bakery, hairdresser', async () => {
  for (const [text, id] of [['ПВЗ Озона', 'services.pickup'], ['аптека у дома', 'retail.pharmacy'],
    ['барбершоп', 'services.barbershop'], ['пекарня с кофе', 'food.bakery'], ['парикмахерская эконом', 'services.beauty']])
    assert.equal((await stubParse(text)).params.category_id, id, text);
});

test('parse reads area, ownership, weekdays and round-the-clock', async () => {
  const { params } = await stubParse('Цветочный магазин 40 м², своя точка, по будням круглосуточно');
  assert.equal(params.area_m2, 40);
  assert.equal(params.ownership, 'independent');
  assert.deepEqual(params.hours, { open: '00:00', close: '24:00', days: 'weekdays' });
  assert.equal(params.format, 'store');
});

test('parse keeps raw text and trims to 2000 chars', async () => {
  const { params } = await stubParse('кофейня '.repeat(400));
  assert.equal(params.raw_text.length, 2000);
});

test('categories mirror contract/categories.json', () => {
  const ids = JSON.parse(readFileSync('contract/categories.json', 'utf8')).categories.map((c) => c.id);
  assert.deepEqual(CATEGORIES.map((c) => c.id), ids);
  for (const c of CATEGORIES) assert.ok(c.label && c.icon && ['food', 'retail', 'services'].includes(c.group), c.id);
});
