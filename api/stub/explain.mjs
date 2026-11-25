// Заглушка POST /v1/explain: разбор собирается шаблонами только из чисел карточки.
import { unknownNumbers } from '../numbers.mjs';

const ru = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const ZONE = { point: '', r300: 'в 300 м', r400: 'в 400 м', r500: 'в 500 м', r800: 'в 800 м', walk5: 'в 5 минутах пешком', walk10: 'в 10 минутах пешком' };
const pct = (share) => Math.round(share * 100);

function better(indicator) {
  const p = indicator.percentile_city;
  return p === null ? '' : ` Это лучше, чем у ${ru.format(Math.round(p))}% точек Москвы.`;
}

function phrase(indicator) {
  const v = typeof indicator.value === 'number' ? ru.format(indicator.value) : indicator.value;
  const zone = ZONE[indicator.zone] ?? '';
  const plus = indicator.effect !== 'minus';
  switch (indicator.icon) {
    case 'metro': return `До входа в метро ${v} м: ${plus ? 'поток к метро проходит рядом' : 'метро далеко, поток к нему идёт мимо'}.`;
    case 'competitor': return plus ? `Конкурентов ${zone} всего ${v}: место не перегрето.` : `Конкурентов ${zone}: ${v}. Нужна понятная причина зайти именно к вам.`;
    case 'stop': return `Остановок ${zone}: ${v}. ${plus ? 'Они добавляют прохожих.' : 'Транспорта рядом мало.'}`;
    case 'office': return `Офисов ${zone}: ${v}. ${plus ? 'Это спрос в обед и после работы.' : 'Офисного спроса почти нет.'}`;
    case 'anchor': return `Объектов притяжения ${zone}: ${v}. ${plus ? 'Люди приходят сюда по делам.' : 'Поводов зайти в эту часть улицы мало.'}`;
    case 'residents': return `Жителей ${zone}: около ${v}. ${plus ? 'Это спрос каждый день.' : 'Жилья вокруг немного.'}`;
    case 'history': return `Смен арендаторов в доме: ${v}. ${plus ? 'Место держит арендаторов.' : 'Узнайте, почему уходили прежние.'}`;
    default: return `${indicator.label}: ${v}.`;
  }
}

const CHECK = {
  competitor: 'Обойдите конкурентов рядом: цены, очереди, часы работы.',
  metro: 'Пройдите от метро до двери и посмотрите, видна ли вывеска.',
  stop: 'Посмотрите, с какой стороны улицы выходят люди с остановок.',
  anchor: 'Проверьте, по пути ли вы от объектов притяжения к домам и метро.',
  history: 'Спросите у соседей и собственника, почему уходили прежние арендаторы.',
  residents: 'Вечером в будни посмотрите, много ли людей идёт к домам мимо входа.',
};

const item = (text, ids) => ({ text, indicator_ids: ids });

export async function explain(card) {
  const indicators = card.place.indicators;
  const byWeight = (a, b) => (b.weight ?? 0) - (a.weight ?? 0);
  const plus = indicators.filter((i) => i.effect === 'plus').sort(byWeight).slice(0, 3);
  let minus = indicators.filter((i) => i.effect === 'minus').sort(byWeight).slice(0, 3);
  if (!minus.length) minus = indicators.filter((i) => i.effect === 'neutral').sort(byWeight).slice(0, 1);

  const strengths = plus.map((i) => item(phrase(i) + better(i), [i.id]));
  const weaknesses = minus.map((i) => item(phrase(i), [i.id]));

  const { forecast } = card;
  if (forecast.status === 'validated' && forecast.baseline?.category != null) {
    const text = `Шанс проработать здесь год - ${pct(forecast.probability)}%, в среднем по городу для такого бизнеса - ${pct(forecast.baseline.category)}%.`;
    const ids = forecast.drivers.map((d) => d.indicator_id);
    (forecast.probability >= forecast.baseline.category ? strengths : weaknesses).unshift(item(text, ids));
  }
  if (!weaknesses.length && card.limits.length) weaknesses.push(item(card.limits[0], []));

  const checks = minus.filter((i) => CHECK[i.icon]).map((i) => item(CHECK[i.icon], [i.id]));
  for (const text of card.field_checks) if (checks.length < 4) checks.push(item(text, []));

  const result = {
    schema: 'locaction.explain/1',
    card_id: card.card_id,
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    checks: checks.slice(0, 5),
  };
  const unknown = unknownNumbers(result, card);
  result.check = { numbers_ok: unknown.length === 0, unknown_numbers: unknown };
  return result;
}
