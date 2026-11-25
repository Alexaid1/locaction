// LOCACTION: экраны и переходы. Главная → карта → анкета → карточка.
import { createMapView, hasWebGL } from './map-view.mjs';
import { mountSearchBox } from './search-box.mjs';
import { mountBuildingPopup } from './building-popup.mjs';
import { encode, decode } from './state.mjs';
import { morph } from './motion.mjs';
import { icon } from './icons.mjs';
import { mountQuestionnaire } from './questionnaire.mjs';
import * as client from '../api/client.mjs';

const body = document.body;
const $ = (selector) => document.querySelector(selector);
const shell = $('#map-shell');
const sheet = $('#sheet');
const toastEl = $('#toast');

const app = {
  view: null,
  stations: [],
  state: { screen: 'home' },
  pick: null,
  screens: {},
};
export default app;

for (const [action, name] of [['zoom-in', 'plus'], ['zoom-out', 'minus'], ['collapse', 'collapse']]) {
  document.querySelector(`[data-action="${action}"]`).innerHTML = icon(name, 20);
}
$('.map-expand-icon').innerHTML = icon('expand', 18);
$('.compare-icon').innerHTML = icon('compare', 18);

let toastTimer;
export function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
}

export function save() {
  const url = app.state.screen === 'home' ? location.pathname + location.search : location.pathname + location.search + encode(app.state);
  history.replaceState(null, '', url);
}

const ORDER = ['map', 'form', 'result'];
function renderStepper() {
  const current = ORDER.indexOf(app.state.screen);
  document.querySelectorAll('.stepper li').forEach((li, i) => {
    li.classList.toggle('is-current', i === current);
    li.classList.toggle('is-done', current > i);
    const button = li.querySelector('button');
    const reachable = (i === 0) || (i === 1 && app.state.point) || (i === 2 && app.state.params?.category_id);
    button.disabled = !reachable || i === current;
  });
}

export async function setScreen(screen) {
  if (body.dataset.screen === screen) { renderStepper(); return; }
  const fromHome = body.dataset.screen === 'home' || screen === 'home';
  await morph(shell, () => {
    body.dataset.screen = screen;
    app.view?.resize();
  }, { duration: fromHome ? 560 : 480, radius: screen === 'home' ? ['0px', '24px'] : undefined });
  app.view?.resize();
  renderStepper();
}

// --- экран карты ---
const popup = mountBuildingPopup($('#pick-card'), {
  onConfirm: (pick) => app.screens.form?.(pick),
  onClose: () => { popup.hide(); body.classList.remove('has-pick'); app.view?.select(null); },
});

export async function goMap() {
  app.state = { ...app.state, screen: 'map' };
  await setScreen('map');
  app.view?.setMode('select');
  save();
}

export async function goHome() {
  popup.hide();
  searchBox.clear();
  body.classList.remove('has-pick');
  app.view?.select(null);
  app.state = { screen: 'home' };
  await setScreen('home');
  app.view?.setMode('card');
  app.view?.overview();
  save();
}

async function showPick(pick, { fly = false } = {}) {
  app.pick = pick;
  app.state = { screen: 'map', point: pick.lngLat, building: pick.building };
  save();
  body.classList.add('has-pick');
  if (app.view) {
    if (fly) {
      await app.view.flyTo(pick.lngLat, { zoom: 17.2, pitch: 45 });
      const found = pick.building && app.view.buildingById(pick.building.osm);
      if (found) pick.building = { ...found, address: pick.building.address ?? found.address };
    } else if (app.view.map.getZoom() < 16) {
      app.view.flyTo(pick.lngLat, { zoom: 17, pitch: 40, duration: 900 });
    }
    app.view.select(pick);
  }
  popup.show(pick, app.stations);
}

const searchBox = mountSearchBox($('#search'), {
  onChoose: async (row) => {
    const pick = { lngLat: { lat: row.y, lon: row.x }, building: { osm: row.o, unom: null, address: row.a, kind: 'unknown', footprint: null }, street: null };
    if (app.view && body.dataset.screen !== 'map') await goMap();
    await showPick(pick, { fly: true });
  },
});

// --- действия ---
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const map = app.view?.map;
  if (action === 'home') { event.preventDefault(); goHome(); }
  if (action === 'expand') goMap();
  if (action === 'collapse') goHome();
  if (action === 'zoom-in') map?.zoomIn();
  if (action === 'zoom-out') map?.zoomOut();
  if (action === 'step-map') app.screens.backToMap?.();
  if (action === 'step-form') app.screens.form?.(app.pick);
  if (action === 'step-result') app.screens.result?.();
  if (action === 'compare') app.screens.compare?.();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.target.closest('input, textarea')) return;
  if (body.dataset.screen === 'map') {
    if (body.classList.contains('has-pick')) { popup.hide(); body.classList.remove('has-pick'); app.view?.select(null); } else goHome();
  }
});
shell.addEventListener('pointerdown', (event) => {
  if (body.dataset.screen === 'home' && app.view && !event.target.closest('button, a')) goMap();
});

app.screens.backToMap = async () => {
  if (!app.pick) return goMap();
  await goMap();
  await showPick(app.pick);
};

// --- запуск ---
async function start() {
  app.stations = await fetch(new URL('../map/metro.json', import.meta.url)).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  if (hasWebGL()) {
    try {
      app.view = await createMapView($('#map'));
      body.dataset.map = 'ready';
      app.view.setMode('card');
      app.view.on('pick', (pick) => { searchBox.set(''); showPick(pick); });
      app.view.on('outside', () => toast('Пока считаем только Москву'));
    } catch {
      app.view = null;
    }
  }
  if (!app.view) body.dataset.map = 'fallback';

  const restored = decode(location.hash);
  if (!restored || restored.screen === 'home') { renderStepper(); return; }
  if (restored.screen === 'compare') { app.screens.compare?.(); return; }
  const pick = { lngLat: restored.point, building: restored.building ?? null, street: null };
  app.pick = pick;
  if (restored.screen === 'map') {
    await goMap();
    await showPick(pick, { fly: true });
  } else {
    app.state = restored;
    await (restored.screen === 'result' ? app.screens.result?.(restored) : app.screens.form?.(pick, restored.params));
  }
  renderStepper();
}

app.ready = start();
app.searchBox = searchBox;
app.popup = popup;
app.sheet = sheet;

// --- анкета ---
app.screens.form = async (pick, params = app.state.params ?? null) => {
  if (!pick) return;
  app.pick = pick;
  popup.hide();
  app.state = { screen: 'form', point: pick.lngLat, building: pick.building, params };
  await setScreen('form');
  app.view?.setMode('form');
  app.view?.select(pick);
  app.view?.flyTo(pick.lngLat, { zoom: 17.4, pitch: 55, bearing: -25, duration: 1100 });
  const address = pick.building?.address ?? (pick.street ? `${pick.street}, рядом` : 'Точка на карте');
  mountQuestionnaire(sheet, {
    address,
    initial: params,
    parse: (text) => client.parse(text),
    onSubmit: (next) => {
      app.state = { ...app.state, params: next };
      save();
      if (app.screens.result) app.screens.result(app.state); else toast('Карточка - в следующем шаге');
    },
  });
  sheet.scrollTop = 0;
  save();
};
