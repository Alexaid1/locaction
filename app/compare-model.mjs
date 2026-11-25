// Сравнение точек без DOM: до 5 карточек в памяти браузера, данные для экрана сравнения.
import { indicatorValue } from './format.mjs';

const KEY = 'locaction.compare.v1';
const LIMIT = 5;

function safeStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function compareStore(storage = safeStorage()) {
  let memory = null;
  const read = () => {
    if (memory) return memory;
    try {
      const parsed = JSON.parse(storage?.getItem(KEY) ?? '[]');
      memory = Array.isArray(parsed) ? parsed.filter((c) => c?.schema === 'locaction.card/1') : [];
    } catch {
      memory = [];
    }
    return memory;
  };
  const write = (cards) => {
    memory = cards;
    try { storage?.setItem(KEY, JSON.stringify(cards)); } catch { /* только в памяти */ }
    return cards;
  };
  return {
    list: () => [...read()],
    add(card) { return write([...read().filter((c) => c.card_id !== card.card_id), card].slice(-LIMIT)); },
    remove(cardId) { return write(read().filter((c) => c.card_id !== cardId)); },
    clear() { return write([]); },
    has(cardId) { return read().some((c) => c.card_id === cardId); },
  };
}

export function compareModel(cards) {
  return cards.map((card) => {
    const top = [...card.place.indicators].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 3)
      .map((i) => ({ label: i.label, value: indicatorValue(i), effect: i.effect, icon: i.icon }));
    return {
      card_id: card.card_id,
      address: card.point.address ?? 'Точка на карте',
      category: card.params.category_id,
      score: card.place.score ? Math.round(card.place.score.value) : null,
      forecast: card.forecast.status === 'validated' && card.forecast.probability !== null ? Math.round(card.forecast.probability * 100) : null,
      top,
    };
  });
}
