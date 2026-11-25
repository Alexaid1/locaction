// Числа и подписи по-русски.
const int = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export const formatInt = (value) => int.format(value);
export const formatOne = (value) => one.format(value);

export function distance(metres) {
  if (!Number.isFinite(metres)) return '-';
  return metres < 1000 ? `${int.format(Math.round(metres / 10) * 10)} м` : `${one.format(metres / 1000)} км`;
}

export function plural(n, [one_, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one_;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const UNIT = {
  m: (v) => distance(v),
  count: (v) => int.format(v),
  people: (v) => `${int.format(v)} чел.`,
  m2: (v) => `${int.format(v)} м²`,
  year: (v) => String(v),
  bool: (v) => (v ? 'есть' : 'нет'),
  share: (v) => `${int.format(Math.round(v * 100))}%`,
};

export function indicatorValue({ value, unit }) {
  if (value === null || value === undefined) return 'нет данных';
  return (UNIT[unit] ?? String)(value);
}

export const ZONE_LABEL = {
  point: '', r300: '300 м', r400: '400 м', r500: '500 м', r800: '800 м', walk5: '5 мин пешком', walk10: '10 мин пешком',
};

export const KIND_LABEL = {
  residential: 'Жилой дом', commercial: 'Коммерческое здание', mixed: 'Смешанное здание', other: 'Нежилое здание', unknown: 'Тип не указан',
};
