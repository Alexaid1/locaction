// Анкета без DOM: состояние формы ↔ параметры locaction.params/1, подписи чипов.
import { categoryById } from '../api/stub/osm-categories.mjs';
import { missingOf } from '../api/stub/parse.mjs';

export const FORMATS = [
  ['takeaway', 'Навынос', 'coffee'], ['seating', 'С посадкой', 'canteen'], ['kiosk', 'Киоск', 'box'],
  ['store', 'Магазин', 'bag'], ['service_room', 'Кабинет', 'scissors'], ['pickup', 'Пункт выдачи', 'box'],
];
export const AUDIENCE = [
  ['commuters', 'Едут к метро', 'metro'], ['residents', 'Жители рядом', 'residents'], ['office_workers', 'Офисы', 'office'],
  ['students', 'Студенты', 'student'], ['tourists', 'Туристы', 'tourist'], ['families', 'Семьи с детьми', 'family'],
  ['drivers', 'Водители', 'car'],
];
export const DAYS = [['daily', 'каждый день'], ['weekdays', 'по будням'], ['weekends', 'по выходным']];
export const OWNERSHIP = [['independent', 'Своя точка'], ['chain', 'Сеть'], ['franchise', 'Франшиза']];

const label = (list, id) => list.find(([key]) => key === id)?.[1] ?? null;
const ORDER = AUDIENCE.map(([id]) => id);

export function emptyForm() {
  return {
    category_id: null, format: null, avg_check_rub: null, open: null, close: null, days: 'daily',
    audience: new Set(), area_m2: null, ownership: null, source: 'form', raw_text: null,
  };
}

export function formToParams(form) {
  const params = {
    schema: 'locaction.params/1',
    category_id: form.category_id ?? null,
    format: form.format ?? null,
    avg_check_rub: form.avg_check_rub ?? null,
    hours: form.open && form.close ? { open: form.open, close: form.close, days: form.days ?? 'daily' } : null,
    audience: ORDER.filter((id) => form.audience?.has(id)),
    area_m2: form.area_m2 ?? null,
    ownership: form.ownership ?? null,
    source: form.source ?? 'form',
    raw_text: form.raw_text ?? null,
  };
  params.missing = missingOf(params);
  return params;
}

export function paramsToForm(params) {
  return {
    category_id: params.category_id ?? null,
    format: params.format ?? null,
    avg_check_rub: params.avg_check_rub ?? null,
    open: params.hours?.open ?? null,
    close: params.hours?.close ?? null,
    days: params.hours?.days ?? 'daily',
    audience: new Set(params.audience ?? []),
    area_m2: params.area_m2 ?? null,
    ownership: params.ownership ?? null,
    source: params.source ?? 'form',
    raw_text: params.raw_text ?? null,
  };
}

export const canSubmit = (form) => categoryById.has(form.category_id);

export function paramChips(params) {
  const chips = [];
  const add = (field, value, empty, icon) => chips.push({ field, label: value ?? empty, missing: value === null, icon });
  const category = categoryById.get(params.category_id);
  add('category_id', category?.label ?? null, 'Тип бизнеса', category?.icon ?? 'bag');
  add('format', label(FORMATS, params.format), 'Формат', 'form');
  add('avg_check_rub', params.avg_check_rub ? `Чек ${params.avg_check_rub.toLocaleString('ru-RU')} ₽` : null, 'Средний чек', 'wallet');
  add('hours', params.hours ? `${params.hours.open}-${params.hours.close}, ${label(DAYS, params.hours.days)}` : null, 'Часы работы', 'clock');
  if (params.audience?.length) for (const id of params.audience) add('audience', label(AUDIENCE, id), '', AUDIENCE.find(([k]) => k === id)[2]);
  else add('audience', null, 'Кто ваши гости', 'users');
  add('area_m2', params.area_m2 ? `${params.area_m2} м²` : null, 'Площадь', 'area');
  add('ownership', label(OWNERSHIP, params.ownership), 'Своя или сеть', 'chain');
  return chips;
}
