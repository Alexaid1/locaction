// Границы расчёта: Москва с ТиНАО и Зеленоградом (как в contract/card.schema.json).
export const BOUNDS = { minLat: 55.1, maxLat: 56.1, minLon: 36.8, maxLon: 38.0 };
export const inBounds = ({ lat, lon } = {}) => lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon;
