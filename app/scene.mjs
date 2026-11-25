// 3D-сцена результата: ночная тема, объём зданий, кольцо 800 м, метки объектов влияния, облёт.
import { icon } from './icons.mjs';
import { animate } from './map-view.mjs';
import { reducedMotion } from './motion.mjs';
import { distance } from './format.mjs';
import { kindsFor } from './panel-model.mjs';
import { createSmoke } from './smoke.mjs';
import { groupPoints, legendItems, KIND_INFO } from './poi-model.mjs';

const NIGHT = {
  paper: { 'background-color': '#0d1915' },
  'district-fill': { 'fill-color': '#13221c' },
  'district-edges': { 'line-color': '#2b4037' },
  paths: { 'line-color': '#2b3d35' },
  access: { 'line-color': '#2f433a' },
  'local-streets': { 'line-color': '#3d554a' },
  arterials: { 'line-color': '#526b5d' },
  'main-roads': { 'line-color': '#68826f' },
  'street-names': { 'text-color': '#9fb4a8', 'text-halo-color': '#0d1915' },
  'district-labels': { 'text-color': '#9fb4a8', 'text-halo-color': '#0d1915' },
  'city-labels': { 'text-color': '#9fb4a8', 'text-halo-color': '#0d1915' },
  'building-outlines': { 'line-color': '#2b4037' },
};
const HEIGHT = ['match', ['get', 'kind'], 'residential', 30, 'mixed', 24, 'commercial', 16, 'other', 12, 10];
const MAX_MARKERS = 32;

function circle(lon, lat, radius, steps = 96) {
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos(lat * Math.PI / 180));
  const ring = Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat];
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

function setNight(map, on, saved) {
  for (const [layer, paint] of Object.entries(NIGHT)) {
    if (!map.getLayer(layer)) continue;
    for (const [prop, value] of Object.entries(paint)) {
      const key = `${layer}|${prop}`;
      if (on) {
        if (!saved.has(key)) saved.set(key, map.getPaintProperty(layer, prop));
        map.setPaintProperty(layer, prop, value);
      } else if (saved.has(key)) {
        map.setPaintProperty(layer, prop, saved.get(key));
      }
    }
  }
  if (map.getLayer('building-fill')) {
    if (on && !saved.has('building-fill|fill-color')) saved.set('building-fill|fill-color', map.getPaintProperty('building-fill', 'fill-color'));
    map.setPaintProperty('building-fill', 'fill-color', on ? '#1c2e27' : saved.get('building-fill|fill-color'));
  }
}

function ensureRing(map) {
  if (map.getSource('ring')) return;
  map.addSource('ring', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'ring-fill', type: 'fill', source: 'ring', paint: { 'fill-color': '#ffe6a8', 'fill-opacity': 0.05 } }, 'city-3d');
  map.addLayer({ id: 'ring-line', type: 'line', source: 'ring', paint: { 'line-color': '#ffe6a8', 'line-width': 1.6, 'line-opacity': 0.7, 'line-dasharray': [2, 2] } }, 'city-3d');
}

export function playCalculating(view, point) {
  const { map } = view;
  ensureRing(map);
  let running = true;
  const start = performance.now();
  const frame = (now) => {
    if (!running) return;
    const t = ((now - start) % 1400) / 1400;
    map.getSource('ring').setData(circle(point.lon, point.lat, 30 + 770 * (1 - (1 - t) ** 2)));
    map.setPaintProperty('ring-fill', 'fill-opacity', 0.18 * (1 - t));
    map.setPaintProperty('ring-line', 'line-opacity', 0.9 * (1 - t));
    requestAnimationFrame(frame);
  };
  if (!reducedMotion()) requestAnimationFrame(frame);
  return { stop() { running = false; } };
}

const describe = (p) => `${KIND_INFO[p.kind]?.one ?? 'Объект'}${p.name ? `: ${p.name}` : ''}, ${distance(p.distance_m)}${p.count > 1 ? ` (ещё ${p.count - 1} рядом)` : ''}`;

function markerElement(point, index) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'poi';
  el.dataset.kind = point.kind;
  el.dataset.effect = point.effect;
  el.style.setProperty('--i', index);
  el.style.setProperty('--s', 0.8 + point.strength * 0.35);
  el.setAttribute('aria-label', describe(point));
  el.innerHTML = `<span class="poi-dot">${icon(point.kind, 16)}${point.count > 1 ? `<b class="poi-count">${point.count}</b>` : ''}</span>`;
  return el;
}

export function showResult(view, card, { padding } = {}) {
  const { map, engine } = view;
  const saved = new Map();
  const point = card.point;
  const osm = card.point.building?.osm ?? '';
  let alive = true;

  setNight(map, true, saved);
  ensureRing(map);
  map.getSource('ring').setData({ type: 'FeatureCollection', features: [circle(point.lon, point.lat, card.map.radius_m), circle(point.lon, point.lat, 300)] });
  map.setPaintProperty('ring-fill', 'fill-opacity', 0.04);
  map.setPaintProperty('ring-line', 'line-opacity', 0.55);

  map.setFilter('city-3d', ['!=', ['get', 'osm'], osm]);
  map.setPaintProperty('city-3d', 'fill-extrusion-color', '#2a3d34');
  map.setLayoutProperty('city-3d', 'visibility', 'visible');
  map.setPaintProperty('pick-3d', 'fill-extrusion-color', '#5fcf9d');
  animate(900, (t) => {
    if (!alive) return;
    map.setPaintProperty('city-3d', 'fill-extrusion-height', ['*', 1 - (1 - t) ** 3, HEIGHT]);
    map.setPaintProperty('pick-3d', 'fill-extrusion-height', 24 + 16 * t);
  });

  const points = card.map.points;
  // Объекты в самом здании (ближе 30 м) не рисуем меткой: они закрывали бы выбранное здание. В легенде они учтены.
  const { shown, rest } = groupPoints(points.filter((p) => p.distance_m >= 30));
  const popup = new engine.Popup({ closeButton: false, closeOnClick: true, offset: 34, className: 'poi-tip', maxWidth: '240px' });
  const markers = shown.slice(0, MAX_MARKERS).map((p, i) => {
    const element = markerElement(p, i);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      popup.setLngLat([p.lon, p.lat]).setText(describe(p)).addTo(map);
    });
    const marker = new engine.Marker({ element, anchor: 'bottom', pitchAlignment: 'viewport' }).setLngLat([p.lon, p.lat]).addTo(map);
    return { marker, point: p };
  });

  // Легенда на карте: что значат метки, с переключателями по типам.
  const hidden = new Set();
  const legend = document.createElement('div');
  legend.className = 'poi-legend';
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', 'Объекты на карте');
  legend.innerHTML = legendItems(points).map((item) => `
    <button type="button" class="poi-chip" data-kind="${item.kind}" data-effect="${item.kind === 'competitor' ? 'minus' : 'plus'}" aria-pressed="true">
      ${icon(item.kind, 16)}<span>${item.label}</span><b>${item.count}</b></button>`).join('');
  document.querySelector('#map-shell').append(legend);
  const applyHidden = () => {
    for (const { marker, point: p } of markers) marker.getElement().hidden = hidden.has(p.kind);
    if (map.getLayer('poi-rest')) map.setFilter('poi-rest', ['!', ['in', ['get', 'kind'], ['literal', [...hidden]]]]);
    smoke.hide([...hidden]);
  };
  legend.addEventListener('click', (event) => {
    const chip = event.target.closest('.poi-chip');
    if (!chip) return;
    const on = chip.getAttribute('aria-pressed') !== 'true';
    chip.setAttribute('aria-pressed', String(on));
    if (on) hidden.delete(chip.dataset.kind); else hidden.add(chip.dataset.kind);
    popup.remove();
    applyHidden();
  });
  map.addSource('poi-rest', { type: 'geojson', data: { type: 'FeatureCollection', features: [...rest, ...shown.slice(MAX_MARKERS)].map((p) => ({
    type: 'Feature', properties: { effect: p.effect, kind: p.kind }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) } });
  map.addLayer({ id: 'poi-rest', type: 'circle', source: 'poi-rest', paint: {
    'circle-radius': 3, 'circle-color': ['match', ['get', 'effect'], 'minus', '#e0795b', '#7fd6ab'], 'circle-opacity': 0.8,
    'circle-stroke-color': '#0d1915', 'circle-stroke-width': 1 } });

  const smoke = createSmoke(map, document.querySelector('#smoke'), {
    segments: card.flows.segments, points: shown, center: point, reducedMotion: reducedMotion(),
  });

  let orbiting = !reducedMotion();
  let last = performance.now();
  const stopOrbit = () => { orbiting = false; };
  view.on('interact', stopOrbit);
  const spin = (now) => {
    if (!alive || !orbiting) return;
    map.setBearing(map.getBearing() + ((now - last) / 1000) * 4);
    last = now;
    requestAnimationFrame(spin);
  };
  map.flyTo({ center: [point.lon, point.lat], zoom: 16.1, pitch: 58, bearing: -20, padding, duration: reducedMotion() ? 0 : 1600, essential: true });
  map.once('moveend', () => { last = performance.now(); if (orbiting) requestAnimationFrame(spin); });

  return {
    stopOrbit,
    highlight(indicatorId) {
      const kinds = indicatorId ? kindsFor(indicatorId) : [];
      for (const { marker, point: p } of markers) {
        const el = marker.getElement();
        el.classList.toggle('is-hot', kinds.includes(p.kind));
        el.classList.toggle('is-dim', kinds.length > 0 && !kinds.includes(p.kind));
      }
      smoke.highlight(kinds);
      return kinds;
    },
    setPeriod(period) { smoke.setPeriod(period); },
    destroy() {
      alive = false;
      smoke.destroy();
      orbiting = false;
      markers.forEach(({ marker }) => marker.remove());
      popup.remove();
      legend.remove();
      if (map.getLayer('poi-rest')) map.removeLayer('poi-rest');
      if (map.getSource('poi-rest')) map.removeSource('poi-rest');
      map.getSource('ring')?.setData({ type: 'FeatureCollection', features: [] });
      map.setLayoutProperty('city-3d', 'visibility', 'none');
      map.setPaintProperty('pick-3d', 'fill-extrusion-color', '#3b7561');
      setNight(map, false, saved);
    },
  };
}
