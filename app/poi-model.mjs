// Метки объектов влияния без DOM: слияние близких меток одного типа, лимит по типам, легенда.
import { haversine } from './search.mjs';

export const KIND_INFO = {
  metro: { label: 'Метро', one: 'Вход в метро', limit: 6 },
  competitor: { label: 'Конкуренты', one: 'Конкурент', limit: 10 },
  anchor: { label: 'Притяжение', one: 'Объект притяжения', limit: 10 },
  stop: { label: 'Остановки', one: 'Остановка', limit: 6 },
  office: { label: 'Офисы', one: 'Офис', limit: 8 },
  university: { label: 'Вузы', one: 'Вуз', limit: 4 },
  residential: { label: 'Жильё', one: 'Жилой дом', limit: 4 },
};
const ORDER = Object.keys(KIND_INFO);
const MERGE_M = 45;

// points уже отсортированы по силе влияния (так их отдаёт карточка).
export function groupPoints(points) {
  const shown = [];
  const rest = [];
  const perKind = {};
  for (const p of points) {
    const near = shown.find((s) => s.kind === p.kind && haversine(s.lon, s.lat, p.lon, p.lat) <= MERGE_M);
    if (near) { near.count += 1; continue; }
    const limit = KIND_INFO[p.kind]?.limit ?? 4;
    if ((perKind[p.kind] ?? 0) < limit) {
      perKind[p.kind] = (perKind[p.kind] ?? 0) + 1;
      shown.push({ ...p, count: 1 });
    } else {
      rest.push(p);
    }
  }
  return { shown, rest };
}

export function legendItems(points) {
  const counts = {};
  for (const p of points) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  return ORDER.filter((kind) => counts[kind]).map((kind) => ({ kind, label: KIND_INFO[kind].label, count: counts[kind] }));
}
