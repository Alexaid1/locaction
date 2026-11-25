import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, ApiError } from '../api/client.mjs';
import { example } from './contract.mjs';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('real API: card posts to base/v1/card without hints', async () => {
  const calls = [];
  const client = createClient('https://api.example/', async (url, init) => { calls.push([url, init]); return reply(200, example('card-validated.json')); });
  const request = { point: { lat: 55.8, lon: 37.4 }, building: null, params: example('parse-response.json').params };
  const card = await client.card(request, { roads: [1, 2, 3] });
  assert.equal(card.schema, 'locaction.card/1');
  assert.equal(calls[0][0], 'https://api.example/v1/card');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), request);
});

test('real API: server error becomes ApiError with code and message', async () => {
  const client = createClient('https://api.example', async () => reply(422, { error: { code: 'out_of_area', message: 'Пока считаем только Москву' } }));
  await assert.rejects(client.card({}), (e) => e instanceof ApiError && e.code === 'out_of_area' && e.message === 'Пока считаем только Москву');
});

test('real API: network failure becomes ApiError network', async () => {
  const client = createClient('https://api.example', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(client.parse('кофейня'), (e) => e instanceof ApiError && e.code === 'network');
});

test('real API: explain sends card_id and rejects invented numbers', async () => {
  const card = example('card-validated.json');
  const bad = example('explain-response.json');
  bad.strengths[0].text += ' Выручка 900 000 ₽.';
  let sent;
  const client = createClient('https://api.example', async (url, init) => { sent = JSON.parse(init.body); return reply(200, bad); });
  await assert.rejects(client.explain(card), (e) => e.code === 'llm_failed');
  assert.deepEqual(sent, { card_id: card.card_id });
});

test('stub base uses the built-in stub', async () => {
  const client = createClient('stub', async () => assert.fail('fetch must not be called'));
  const { params } = await client.parse('аптека');
  assert.equal(params.category_id, 'retail.pharmacy');
});

test('real API: hanging server times out as network error', async () => {
  const client = createClient('https://api.example', () => new Promise(() => {}), { timeoutMs: 50 });
  const t0 = Date.now();
  await assert.rejects(client.card({}), (e) => e.code === 'network');
  assert.ok(Date.now() - t0 < 1000);
});
