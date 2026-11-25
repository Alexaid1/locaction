// Карта приложения: подложка и здания из демо, выбор точки, плавные перелёты, режимы экранов.
import { loadBasemap } from '../map/basemap.mjs';
import { addBuildingStyle } from '../map/buildings.mjs';
import { inBounds } from '../api/bounds.mjs';
import { reducedMotion } from './motion.mjs';

const ROAD_LAYERS = ['paths', 'access', 'local-streets', 'arterials', 'main-roads'];
const PICK = 'pick-3d';
const PICK_HEIGHT = 24;

function loadEngineStyles() {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('../map/vendor/maplibre-gl.css', import.meta.url).href;
  return new Promise((resolve, reject) => {
    css.onload = resolve;
    css.onerror = reject;
    document.head.append(css);
  });
}

export function hasWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

const ease = (t) => 1 - (1 - t) ** 3;
const overshoot = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

export function animate(duration, step) {
  return new Promise((resolve) => {
    if (reducedMotion() || duration <= 0) { step(1); resolve(); return; }
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / duration);
      step(t);
      if (t < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

function propsToBuilding(props) {
  if (!props?.osm) return null;
  return {
    osm: props.osm, unom: props.unom || null, address: props.address || null,
    kind: props.kind || 'unknown', footprint: Number.isFinite(props.footprint) ? props.footprint : null,
  };
}

export async function createMapView(container) {
  const [engine, basemap] = await Promise.all([import('../map/vendor/maplibre-gl.mjs'), loadBasemap(), loadEngineStyles()]);
  engine.setWorkerCount(1);
  engine.setWorkerUrl(new URL('../map/vendor/maplibre-gl-worker.mjs', import.meta.url).href);
  engine.addProtocol('pmtiles', basemap.tileLoader);

  const style = addBuildingStyle(basemap.style);
  const labels = style.layers.findIndex(({ type }) => type === 'symbol');
  style.layers.splice(labels, 0,
    { id: 'city-3d', type: 'fill-extrusion', source: 'buildings', 'source-layer': 'buildings', minzoom: 14,
      layout: { visibility: 'none' },
      paint: { 'fill-extrusion-color': '#ddd3bb', 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.9, 'fill-extrusion-vertical-gradient': true } },
    { id: PICK, type: 'fill-extrusion', source: 'buildings', 'source-layer': 'buildings', minzoom: 14,
      filter: ['==', ['get', 'osm'], ''],
      paint: { 'fill-extrusion-color': '#3b7561', 'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.96, 'fill-extrusion-vertical-gradient': true } });

  const map = new engine.Map({
    container, style, bounds: basemap.bounds, fitBoundsOptions: { padding: 20, maxZoom: 11 },
    minZoom: 8, maxZoom: 19, maxPitch: 60, renderWorldCopies: false, dragRotate: false, touchPitch: false,
    pitchWithRotate: false, cooperativeGestures: true, attributionControl: false, fadeDuration: 150,
    locale: {
      'CooperativeGesturesHandler.WindowsHelpText': 'Для масштаба используйте Ctrl и прокрутку',
      'CooperativeGesturesHandler.MacHelpText': 'Для масштаба используйте ⌘ и прокрутку',
      'CooperativeGesturesHandler.MobileHelpText': 'Для перемещения по карте используйте два пальца',
      'Map.Title': 'Карта Москвы',
    },
  });
  map.touchZoomRotate.disableRotation();
  await new Promise((resolve, reject) => {
    map.once('load', resolve);
    map.once('error', ({ error }) => { if (error?.name !== 'AbortError') reject(error); });
  });

  const listeners = { pick: [], outside: [], interact: [] };
  const emit = (name, value) => listeners[name].forEach((cb) => cb(value));
  let mode = 'card';
  let selected = null;
  let pin = null;

  function featureAt(point) {
    return map.queryRenderedFeatures(point, { layers: ['building-fill', PICK] })[0] ?? null;
  }

  function streetNear(point) {
    const box = [[point.x - 36, point.y - 36], [point.x + 36, point.y + 36]];
    const layers = ROAD_LAYERS.filter((id) => map.getLayer(id));
    return map.queryRenderedFeatures(box, { layers }).find((f) => f.properties.name)?.properties.name ?? null;
  }

  map.on('click', (event) => {
    if (mode !== 'select') return;
    const lngLat = { lat: event.lngLat.lat, lon: event.lngLat.lng };
    if (!inBounds(lngLat)) { emit('outside', lngLat); return; }
    const feature = featureAt(event.point);
    emit('pick', { lngLat, building: propsToBuilding(feature?.properties), street: feature?.properties.address ? null : streetNear(event.point) });
  });
  map.on('mousemove', (event) => {
    if (mode !== 'select') return;
    map.getCanvas().style.cursor = featureAt(event.point) ? 'pointer' : 'crosshair';
  });
  for (const name of ['mousedown', 'touchstart', 'wheel']) map.on(name, () => emit('interact', name));

  function setPin(lngLat) {
    pin?.remove();
    const el = document.createElement('div');
    el.className = 'pick-pin';
    el.innerHTML = '<span class="pick-pin-dot"></span><span class="pick-pin-ring"></span>';
    pin = new engine.Marker({ element: el, anchor: 'center' }).setLngLat([lngLat.lon, lngLat.lat]).addTo(map);
  }

  async function select(pick) {
    if (selected) map.setFeatureState({ source: 'buildings', sourceLayer: 'buildings', id: selected }, { selected: false });
    selected = pick?.building?.osm ?? null;
    map.setFilter(PICK, ['==', ['get', 'osm'], selected ?? '']);
    map.setPaintProperty(PICK, 'fill-extrusion-height', 0);
    if (!pick) { pin?.remove(); pin = null; return; }
    setPin(pick.lngLat);
    if (selected) {
      map.setFeatureState({ source: 'buildings', sourceLayer: 'buildings', id: selected }, { selected: true });
      await animate(650, (t) => map.setPaintProperty(PICK, 'fill-extrusion-height', PICK_HEIGHT * overshoot(t)));
    }
  }

  function buildingById(osm) {
    const found = map.querySourceFeatures('buildings', { sourceLayer: 'buildings', filter: ['==', ['get', 'osm'], osm] })[0];
    return propsToBuilding(found?.properties);
  }

  function flyTo(lngLat, { zoom = 17, pitch = 40, bearing = map.getBearing(), duration = 1300, padding } = {}) {
    return new Promise((resolve) => {
      map.once('moveend', () => resolve());
      map.flyTo({ center: [lngLat.lon, lngLat.lat], zoom, pitch, bearing, padding, duration: reducedMotion() ? 0 : duration, essential: true });
    });
  }

  function roadsNear(lngLat, radius = 800) {
    const dLat = radius / 111320;
    const dLon = radius / (111320 * Math.cos(lngLat.lat * Math.PI / 180));
    const inside = ([x, y]) => Math.abs(x - lngLat.lon) <= dLon && Math.abs(y - lngLat.lat) <= dLat;
    const out = [];
    for (const f of map.querySourceFeatures('basemap', { sourceLayer: 'roads' })) {
      const geometry = f.geometry;
      const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
      if (lines.some((line) => line.some(inside))) out.push({ type: 'Feature', properties: { kind: f.properties.kind }, geometry });
    }
    return out;
  }

  function setMode(next) {
    mode = next;
    const free = next === 'select' || next === 'result';
    if (free) map.cooperativeGestures.disable(); else map.cooperativeGestures.enable();
    if (next === 'result') { map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); }
    else { map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); }
    for (const handler of ['dragPan', 'scrollZoom', 'doubleClickZoom', 'touchZoomRotate']) {
      if (next === 'form') map[handler].disable(); else map[handler].enable();
    }
    map.getCanvas().style.cursor = next === 'select' ? 'crosshair' : '';
  }

  return {
    map, engine, bounds: basemap.bounds,
    get mode() { return mode; },
    on(name, cb) { listeners[name].push(cb); },
    setMode, select, flyTo, roadsNear, buildingById,
    resize: () => map.resize(),
    overview: () => map.fitBounds(basemap.bounds, { padding: 20, maxZoom: 11, pitch: 0, bearing: 0, duration: reducedMotion() ? 0 : 700 }),
  };
}
