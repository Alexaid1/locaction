// Карточка → то, что показывает панель результата. Без DOM.
import { categoryById } from '../api/stub/osm-categories.mjs';
import { localIntensity } from '../api/stub/flows.mjs';
import { FORMATS } from './form-model.mjs';
import { formatInt, indicatorValue, ZONE_LABEL } from './format.mjs';

const pct = (share) => Math.round(share * 100);

export const PERIODS = [
  { id: 'morning', label: 'Утро', icon: 'morning' },
  { id: 'day', label: 'День', icon: 'day' },
  { id: 'evening', label: 'Вечер', icon: 'evening' },
];

const KINDS = [
  [/^metro/, ['metro']],
  [/^(competitors|osm_same|mos_food_same)/, ['competitor']],
  [/^stops/, ['stop']],
  [/^(offices|office)/, ['office']],
  [/^(attractors|anchor)/, ['anchor']],
  [/^university/, ['university']],
];

export function kindsFor(indicatorId) {
  return KINDS.find(([pattern]) => pattern.test(indicatorId))?.[1] ?? [];
}

function forecastModel(forecast) {
  if (forecast.status === 'validated' && forecast.probability !== null) {
    const base = forecast.baseline?.category ?? forecast.baseline?.city ?? null;
    return { kind: 'validated', pct: pct(forecast.probability), low: pct(forecast.interval?.low ?? forecast.probability),
      high: pct(forecast.interval?.high ?? forecast.probability), city: base === null ? null : pct(base) };
  }
  return { kind: 'pending', message: forecast.message ?? 'Прогноз появится, когда модель пройдёт проверку' };
}

function flowsModel(card) {
  const { flows } = card;
  let rel;
  let numbers = null;
  if (flows.status === 'estimate' && flows.periods.some((p) => p.value !== null)) {
    const top = Math.max(...flows.periods.map((p) => p.value ?? 0)) || 1;
    rel = Object.fromEntries(flows.periods.map((p) => [p.id, (p.value ?? 0) / top]));
    const morning = flows.periods.find((p) => p.id === 'morning');
    if (morning?.low !== null && morning?.high !== null) numbers = `≈ ${formatInt(morning.low)}-${formatInt(morning.high)} чел./ч утром`;
  } else {
    rel = localIntensity(flows.segments, card.point);
  }
  return {
    status: flows.status,
    label: flows.label,
    numbers,
    bars: PERIODS.map((p) => ({ ...p, hours: flows.periods.find((x) => x.id === p.id)?.hours ?? '', rel: Math.max(0, Math.min(1, rel[p.id] ?? 0)) })),
  };
}

export function panelModel(card) {
  const category = categoryById.get(card.params.category_id);
  const format = FORMATS.find(([id]) => id === card.params.format)?.[1];
  const banner = card.engine.version === 'preview-validated' ? 'Пример состояния: прогноз не настоящий'
    : card.engine.kind === 'stub' ? 'Примерные данные' : null;
  const score = card.place.score;
  return {
    title: card.point.address ?? 'Точка на карте',
    subtitle: [category?.label, format?.toLowerCase()].filter(Boolean).join(' · '),
    banner,
    score: score ? { value: score.value, ring: score.value / 100, percentile: score.percentile_city } : null,
    method: score?.method === 'model_v1' ? 'модель LOCACTION' : 'демо-индекс v2',
    forecast: forecastModel(card.forecast),
    flows: flowsModel(card),
    rows: card.place.indicators.map((i) => ({
      id: i.id, icon: i.icon, label: i.label, value: indicatorValue(i), zone: ZONE_LABEL[i.zone] ?? '',
      bar: i.percentile_city === null ? null : i.percentile_city / 100, effect: i.effect, kinds: kindsFor(i.id),
    })),
  };
}
