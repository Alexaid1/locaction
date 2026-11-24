import { loadBasemap } from './basemap.mjs';
import { addDemoMarkers } from './demo-markers.mjs';
import { attachBuildings, addBuildingStyle } from './buildings.mjs';

function loadEngineStyles() {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./vendor/maplibre-gl.css', import.meta.url).href;
  return new Promise((resolve, reject) => {
    css.onload = resolve;
    css.onerror = reject;
    document.head.append(css);
  });
}

export async function mountLocationMap(panel, loadDemo) {
  let map;
  let failed = false;
  const fallback = () => {
    if (failed) return;
    failed = true;
    clearTimeout(timeout);
    panel.dataset.state = 'fallback';
    map?.remove();
  };
  const timeout = setTimeout(fallback, 15000);

  try {
    const canvas = document.createElement('canvas');
    const webgl = canvas.getContext('webgl2');
    if (!webgl) return fallback();
    webgl.getExtension('WEBGL_lose_context')?.loseContext();

    const [engine, basemap, { comparison }] = await Promise.all([
      import('./vendor/maplibre-gl.mjs'), loadBasemap(), loadDemo(), loadEngineStyles(),
    ]);
    if (failed) return;

    engine.setWorkerCount(1);
    engine.setWorkerUrl(new URL('./vendor/maplibre-gl-worker.mjs', import.meta.url).href);
    engine.addProtocol('pmtiles', basemap.tileLoader);
    const overview = { padding: 25, maxZoom: 11 };
    const container = panel.querySelector('#map-canvas');
    map = new engine.Map({
      container,
      style: addBuildingStyle(basemap.style),
      bounds: basemap.bounds,
      fitBoundsOptions: overview,
      minZoom: 7,
      maxZoom: 18,
      maxPitch: 0,
      renderWorldCopies: false,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
      attributionControl: false,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Для масштаба используйте Ctrl и прокрутку',
        'CooperativeGesturesHandler.MacHelpText': 'Для масштаба используйте ⌘ и прокрутку',
        'CooperativeGesturesHandler.MobileHelpText': 'Для перемещения по карте используйте два пальца',
        'Map.Title': 'Карта Москвы',
      },
    });
    map.touchZoomRotate.disableRotation();
    map.on('error', ({ error }) => {
      if (error?.name !== 'AbortError') fallback();
    });
    map.on('webglcontextlost', fallback);

    map.once('load', () => {
      if (failed) return;
      const details = panel.querySelector('#map-selection');
      const selectBuilding = attachBuildings(map, panel, comparison.scored);
      const demoBounds = addDemoMarkers(map, engine, comparison.scored, details, selectBuilding);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)');
      const duration = () => reduce.matches ? 0 : 550;
      const fullExtent = panel.querySelector('#map-overview');
      const demoArea = panel.querySelector('#map-demo');

      fullExtent.addEventListener('click', () => map.fitBounds(basemap.bounds, { ...overview, duration: duration() }));
      demoArea.addEventListener('click', () => map.fitBounds(demoBounds, {
        padding: { left: 42, right: 88, top: 65, bottom: 42 }, maxZoom: 16.1, duration: duration(),
      }));
      panel.querySelector('#map-zoom-in').addEventListener('click', () => map.zoomIn({ duration: duration() }));
      panel.querySelector('#map-zoom-out').addEventListener('click', () => map.zoomOut({ duration: duration() }));
      fullExtent.disabled = false;
      demoArea.disabled = false;
      clearTimeout(timeout);
      panel.dataset.state = 'ready';
    });
  } catch {
    fallback();
  }
}
