// Единственная граница интерфейса с сервером расчёта. Контракт: contract/README.md.
import { API_BASE } from '../config.mjs';
import { unknownNumbers } from './numbers.mjs';
import { ApiError } from './errors.mjs';

export { ApiError };

const MESSAGES = {
  network: 'Сервер недоступен. Проверьте интернет и попробуйте ещё раз.',
  internal: 'Не получилось посчитать. Попробуйте ещё раз.',
  llm_failed: 'Разбор сейчас недоступен.',
};

export function createClient(base, fetchImpl = (...args) => fetch(...args)) {
  if (base === 'stub') {
    let stub;
    const load = () => (stub ??= import('./stub/index.mjs'));
    return {
      parse: async (text) => (await load()).parse(text),
      card: async (request, hints) => (await load()).card(request, hints),
      explain: async (card) => (await load()).explain(card),
    };
  }

  const root = base.replace(/\/+$/, '');
  async function post(path, body) {
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError('network', MESSAGES.network);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const { code = 'internal', message = MESSAGES.internal } = data?.error ?? {};
      throw new ApiError(code, message);
    }
    if (!data) throw new ApiError('internal', MESSAGES.internal);
    return data;
  }

  return {
    parse: (text) => post('/v1/parse', { text }),
    card: (request) => post('/v1/card', request),
    async explain(card) {
      const result = await post('/v1/explain', { card_id: card.card_id });
      if (unknownNumbers(result, card).length) throw new ApiError('llm_failed', MESSAGES.llm_failed);
      return result;
    },
  };
}

const client = createClient(API_BASE);
export const { parse, card, explain } = client;
