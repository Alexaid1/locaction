// Демо-методика v2 для формата «Кофейня навынос».
// Координаты адресов — центры описывающих прямоугольников зданий OSM.
// Для POI используются координаты узлов или центры прямоугольников контуров.
// Радиусы включительны. Расстояния считаются по формуле гаверсинуса.
// Только расстояние до метро округляется до целого метра перед расчётом индекса.
// Весовые коэффициенты и пороги экспертные, без калибровки на результатах кофеен.

export const format = 'Кофейня навынос';
export const indexLabel = 'Индекс локации · демо-методика v2';

const clamp = (value) => Math.max(0, Math.min(1, value));

export const factors = [
  {
    id: 'competitors', label: 'Кафе и кофейни', unit: '', weight: 25,
    scope: 'В радиусе 300 м',
    rule: 'При полном наборе данных 0 кафе дают 25 баллов. Каждое кафе уменьшает вклад на 2,5 балла до нуля при 10 кафе.',
    score: (count) => Math.max(0, 1 - count / 10),
  },
  {
    id: 'metro', label: 'До входа в метро', unit: 'м', weight: 35,
    scope: 'По прямой',
    rule: 'До 75 м — максимум. От 75 до 700 м балл снижается линейно до нуля.',
    score: (metres) => clamp((700 - metres) / (700 - 75)),
  },
  {
    id: 'stops', label: 'Остановки', unit: '', weight: 15,
    scope: 'В радиусе 300 м',
    rule: 'Балл растёт линейно до 6 посадочных точек.',
    score: (count) => clamp(count / 6),
  },
  {
    id: 'offices', label: 'Офисы', unit: '', weight: 10,
    scope: 'В радиусе 500 м',
    rule: 'Балл растёт линейно до 20 объектов.',
    score: (count) => clamp(count / 20),
  },
  {
    id: 'attractors', label: 'Объекты притяжения', unit: '', weight: 15,
    scope: 'В радиусе 300 м',
    rule: 'Балл растёт линейно до 12 объектов.',
    score: (count) => clamp(count / 12),
  },
];

// amenity=cafe — приближение к конкуренции. Считаем все такие объекты OSM.
// highway=bus_stop — посадочные точки, включая разные стороны улицы.
// office=* без shop=* — офисные объекты, включая учреждения и отделения услуг.
// Объекты притяжения — супермаркеты, ТЦ, фитнес-центры, клиники и больницы.
// Каждый объект в категории считается один раз по паре (тип OSM, ID).
// Жильё и вузы выходят за рамки пяти факторов этого демо.

export const missingRule = 'Если у одного адреса значение недоступно, фактор исключается у всех. Остальные веса пропорционально приводятся к 100. Если общих факторов нет, рейтинг не рассчитывается.';

function readMeasure(location, factor) {
  const metric = location.metrics?.[factor.id];
  if (Number.isInteger(metric?.value) && metric.value >= 0) return { value: metric.value };

  // Для недоступного наблюдения источник может указать причину в metrics[id].reason.
  const reason = !location.metrics ? 'Нет блока показателей'
    : !metric ? 'Показатель отсутствует в выгрузке'
    : typeof metric.reason === 'string' ? metric.reason.trim() : '';
  return { value: null, reason };
}

export function compareLocations(locations) {
  const scored = locations.map((location) => {
    const measures = Object.fromEntries(factors.map((factor) => [factor.id, readMeasure(location, factor)]));
    return { ...location, measures, rank: undefined };
  });
  const excluded = [];
  const effectiveWeights = {};
  let includedWeight = 0;
  let includedCount = 0;
  for (const factor of factors) {
    const unavailable = scored.filter(({ measures }) => measures[factor.id].value === null)
      .map(({ id, address, measures }) => ({ id, address, reason: measures[factor.id].reason }));
    if (unavailable.length > 0) {
      excluded.push({ factor, unavailable });
    } else if (scored.length > 0) {
      effectiveWeights[factor.id] = factor.weight;
      includedWeight += factor.weight;
      includedCount += 1;
    }
  }
  for (const id of Object.keys(effectiveWeights)) {
    effectiveWeights[id] = effectiveWeights[id] * 100 / includedWeight;
  }
  for (const location of scored) {
    let total = 0;
    for (const factor of factors) {
      const measure = location.measures[factor.id];
      const weight = effectiveWeights[factor.id];
      measure.contribution = weight === undefined ? null : factor.score(measure.value) * weight;
      total += measure.contribution ?? 0;
    }
    location.score = includedCount ? Math.round(total * 10) / 10 : null;
  }

  const ranked = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id));
  let rank = 0;
  ranked.forEach((location, index) => {
    if (location.score === null) return;
    if (index === 0 || location.score !== ranked[index - 1].score) rank = index + 1;
    location.rank = rank;
  });
  return { scored, ranked, excluded, effectiveWeights, includedCount, includedWeight };
}

// Разница вкладов считается по общим факторам до округления.
export function compareLeaders(ranked) {
  const [first, second] = ranked;
  if (!second || first.score === null || second.score === null) return null;

  const differences = factors.flatMap((factor) => {
    const a = first.measures[factor.id].contribution;
    const b = second.measures[factor.id].contribution;
    return a === null || b === null ? [] : [{ factor, delta: a - b }];
  }).sort((a, b) => b.delta - a.delta);

  const bestFirst = differences[0];
  const bestSecond = differences.at(-1);
  return {
    first, second,
    firstAdvantage: bestFirst?.delta > 0 ? bestFirst : null,
    secondAdvantage: bestSecond?.delta < 0 ? bestSecond : null,
  };
}
