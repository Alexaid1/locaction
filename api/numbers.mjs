// Правило ИКР: разбор LLM не содержит чисел, которых нет в карточке.
// Та же логика - в tools/check_contract.py (card_numbers, unknown_numbers).

const NUMBER = /\d+(?:[.,]\d+)?/g;
const THOUSANDS = /(\d)[\s  ](?=\d{3}(?!\d))/g;
const canon = (value) => String(Number(Number(value).toPrecision(6)));

export function cardNumbers(card) {
  const found = new Set();
  const walk = (value) => {
    if (typeof value === 'number') {
      found.add(canon(value));
      if (value > 0 && value < 1) found.add(canon(Math.round(value * 100)));
    } else if (typeof value === 'string') {
      for (const n of value.replace(THOUSANDS, '$1').match(NUMBER) ?? []) found.add(canon(n.replace(',', '.')));
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  };
  walk(card);
  return found;
}

export function unknownNumbers(explain, card) {
  const known = cardNumbers(card);
  const texts = ['strengths', 'weaknesses', 'checks'].flatMap((key) => (explain[key] ?? []).map((item) => item.text));
  const seen = texts.flatMap((text) => text.replace(THOUSANDS, '$1').match(NUMBER) ?? []);
  return [...new Set(seen.map((n) => n.replace(',', '.')).filter((n) => !known.has(canon(n))))].sort();
}
