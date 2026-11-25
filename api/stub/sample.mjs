// Примерные данные: если Overpass не ответил, и пример состояния «модель подтверждена».
import { indexFromValues } from './demo-index.mjs';
import { assemble } from './card.mjs';

function seeded(lat, lon) {
  let s = Math.floor(Math.abs(lat * 1e4) * 31 + Math.abs(lon * 1e4) * 17) % 2147483647 || 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

export function sampleParts(point, now = () => new Date()) {
  const rand = seeded(point.lat, point.lon);
  const int = (lo, hi) => Math.round(lo + rand() * (hi - lo));
  const place = indexFromValues({
    metro_dist_m: int(15, 120) * 10, competitors_300: int(0, 8), stops_300: int(0, 6), offices_500: int(0, 15), attractors_300: int(0, 6),
  });
  return {
    place,
    points: [],
    engine: { kind: 'stub', version: 'sample', features_version: null, data_as_of: now().toISOString().slice(0, 10) },
    limits: ['Примерные данные: объекты рядом сейчас не загрузились', 'Выручка и аренда в расчёт не входят', 'Потоки - иллюстрация по улицам, не замер'],
  };
}

const r2 = (v) => Math.round(v * 100) / 100;

export function validatedForecast(place) {
  const p = r2(0.62 + 0.3 * place.score.value / 100);
  const byWeight = (a, b) => b.weight - a.weight;
  const top = [
    ...place.indicators.filter((i) => i.effect === 'plus').sort(byWeight).slice(0, 2),
    ...place.indicators.filter((i) => i.effect === 'minus').sort(byWeight).slice(0, 1),
  ];
  return {
    status: 'validated', horizon_months: 12, probability: p,
    interval: { low: r2(Math.max(0, p - 0.09)), high: r2(Math.min(1, p + 0.06)), level: 0.8 },
    baseline: { city: 0.81, category: 0.79 },
    quality: { roc_auc: 0.68, brier: 0.14, validated_on: 'пример состояния, модель ещё не проверена' },
    drivers: top.map((i) => ({ indicator_id: i.id, direction: i.effect, strength: r2(Math.min(1, i.weight * 2.5)) })),
    message: null,
  };
}

export function sampleCard(request, hints = {}, { validated = false, now = () => new Date() } = {}) {
  const parts = sampleParts(request.point, now);
  if (validated) {
    parts.forecast = validatedForecast(parts.place);
    parts.engine.version = 'preview-validated';
    parts.limits = ['Пример состояния: прогноз не настоящий', ...parts.limits];
  }
  return assemble(request, hints, parts, now);
}
