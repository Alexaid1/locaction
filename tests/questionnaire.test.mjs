import test from 'node:test';
import assert from 'node:assert/strict';
import { formToParams, paramsToForm, canSubmit, emptyForm, paramChips } from '../app/form-model.mjs';
import { assertValid, example } from './contract.mjs';

test('form to params marks missing fields', () => {
  const p = formToParams({ ...emptyForm(), category_id: 'food.coffee', format: 'takeaway', avg_check_rub: 350 });
  assert.deepEqual([...p.missing].sort(), ['area_m2', 'audience', 'hours', 'ownership']);
  assert.equal(p.source, 'form');
  assert.equal(p.hours, null);
  assertValid('params', p);
});

test('hours need both ends; days default to daily', () => {
  const p = formToParams({ ...emptyForm(), category_id: 'food.coffee', open: '08:00', close: '22:00' });
  assert.deepEqual(p.hours, { open: '08:00', close: '22:00', days: 'daily' });
  assert.equal(formToParams({ ...emptyForm(), category_id: 'food.coffee', open: '08:00' }).hours, null);
});

test('audience keeps a stable order', () => {
  const p = formToParams({ ...emptyForm(), category_id: 'food.coffee', audience: new Set(['families', 'commuters']) });
  assert.deepEqual(p.audience, ['commuters', 'families']);
});

test('params to form and back is stable', () => {
  const p = example('parse-response.json').params;
  assert.deepEqual(formToParams(paramsToForm(p)), p);
});

test('submit without category is blocked', () => {
  assert.equal(canSubmit({ ...emptyForm(), category_id: null }), false);
  assert.equal(canSubmit({ ...emptyForm(), category_id: 'retail.pharmacy' }), true);
});

test('chips show found params and flag missing ones', () => {
  const chips = paramChips(example('parse-response.json').params);
  assert.ok(chips.some((c) => c.field === 'category_id' && c.label === 'Кофейня' && !c.missing));
  assert.ok(chips.some((c) => c.field === 'hours' && c.label === '07:00-21:00, каждый день'));
  assert.ok(chips.some((c) => c.field === 'area_m2' && c.missing));
  const none = paramChips({ ...example('parse-response.json').params, category_id: null, missing: ['category_id'] });
  assert.ok(none.some((c) => c.field === 'category_id' && c.missing && c.label === 'Тип бизнеса'));
});

test('formats depend on the business group', async () => {
  const { formatsFor } = await import('../app/form-model.mjs');
  assert.deepEqual(formatsFor('retail.pharmacy').map(([id]) => id), ['store', 'kiosk']);
  assert.deepEqual(formatsFor('food.coffee').map(([id]) => id), ['takeaway', 'seating', 'kiosk']);
  assert.deepEqual(formatsFor('services.pickup').map(([id]) => id), ['service_room', 'kiosk', 'pickup']);
  assert.equal(formatsFor(null).length, 6);
});
