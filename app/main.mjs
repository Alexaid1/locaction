// LOCACTION: экраны и переходы. Главная → карта → анкета → карточка.
import { createMapView, hasWebGL } from './map-view.mjs';
import { mountSearchBox } from './search-box.mjs';
import { mountBuildingPopup } from './building-popup.mjs';
import { encode, decode } from './state.mjs';
import { morph } from './motion.mjs';
import { icon } from './icons.mjs';
import { mountQuestionnaire } from './questionnaire.mjs';
import { mountResultPanel } from './result-panel.mjs';
import { playCalculating, showResult } from './scene.mjs';
import { mountCompare, renderBadge, store as compareStore } from './compare.mjs';
import { API_BASE } from '../config.mjs';
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
  leaveResult();
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
      await app.view.flyTo(pick.lngLat, { zoom: 17.2, pitch: 45, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
      const found = pick.building && app.view.buildingById(pick.building.osm);
      if (found) pick.building = { ...found, address: pick.building.address ?? found.address };
    } else if (app.view.map.getZoom() < 16) {
      app.view.flyTo(pick.lngLat, { zoom: 17, pitch: 40, duration: 900, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
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
  leaveResult();
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

// --- карточка ---
const wide = () => matchMedia('(min-width: 861px)').matches;
const scenePadding = () => (wide() ? { top: 80, right: 440, bottom: 40, left: 40 } : { top: 70, right: 20, bottom: Math.round(innerHeight * 0.45), left: 20 });

// Ждём тайлы улиц вокруг точки, но не дольше ms: во время анимации кольца карта не бывает «idle».
function tilesReady(map, ms = 1200) {
  const end = performance.now() + ms;
  return new Promise((resolve) => {
    const check = () => (map.areTilesLoaded() || performance.now() > end ? resolve() : setTimeout(check, 100));
    check();
  });
}

app.screens.result = async (state = app.state) => {
  const pick = app.pick ?? { lngLat: state.point, building: state.building ?? null, street: null };
  if (!state.params?.category_id) return app.screens.form(pick, state.params);
  app.pick = pick;
  app.scene?.destroy();
  app.scene = null;
  app.state = { screen: 'result', point: pick.lngLat, building: pick.building, params: state.params };
  save();
  const startedAt = Date.now();
  sheet.innerHTML = `<div class="rp rp-loading"><div class="calc-orb"></div><p>Считаем окружение…</p></div>`;
  await setScreen('result');
  body.classList.add('is-night');
  const view = app.view;
  view?.setMode('result');
  let calc;
  if (view) {
    view.select(pick);
    calc = playCalculating(view, pick.lngLat);
    app.calc = calc;
    await view.flyTo(pick.lngLat, { zoom: 16.1, pitch: 50, bearing: -20, padding: scenePadding(), duration: 1200 });
    await tilesReady(view.map);
  }
  const request = { point: pick.lngLat, building: pick.building ? { osm: pick.building.osm, unom: pick.building.unom ?? null } : null, params: state.params };
  const hints = { roads: view ? view.roadsNear(pick.lngLat, 800) : [], address: pick.building?.address ?? (pick.street ? `${pick.street}, рядом` : null), kind: pick.building?.kind ?? 'unknown', startedAt };
  let card;
  try {
    card = await client.card(request, hints);
  } catch (error) {
    calc?.stop();
    body.classList.remove('is-night');
    toast(error.message || 'Не получилось посчитать. Попробуйте ещё раз.');
    return app.screens.form(pick, state.params);
  }
  calc?.stop();
  app.card = card;
  if (view) app.scene = showResult(view, card, { padding: scenePadding() });
  mountResultPanel(sheet, card, {
    onHighlight: (id) => app.scene?.highlight(id),
    onPeriod: (period) => app.scene?.setPeriod(period),
    onExplain: (box, button) => app.screens.explain?.(box, button),
    onCompare: (button) => app.screens.addCompare?.(card, button),
    onPrint: () => app.screens.print?.(),
    onNew: () => app.screens.backToMap(),
  });
  renderStepper();
};

// Убрать 3D-сцену, «дым», кольцо и ночную тему при любом уходе с карточки.
function leaveResult() {
  app.scene?.destroy();
  app.scene = null;
  app.calc?.stop();
  app.calc = null;
  app.view?.map.getSource('ring')?.setData({ type: 'FeatureCollection', features: [] });
  body.classList.remove('is-night');
}

// --- разбор от ИИ ---
const esc = (text) => String(text ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
app.screens.explain = async (box, button) => {
  if (!app.card) return;
  box.hidden = false;
  box.innerHTML = '<div class="shimmer"></div><div class="shimmer"></div>';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  button.classList.add('is-busy');
  try {
    const result = await client.explain(app.card);
    const column = (title, iconName, items, cls) => items.length ? `
      <div class="ex-col ${cls}"><h4>${icon(iconName, 18)}${title}</h4>
        <ul>${items.map((item, i) => `<li style="--i:${i}" data-indicators="${esc(item.indicator_ids.join(' '))}">${esc(item.text)}</li>`).join('')}</ul></div>` : '';
    box.innerHTML = `
      <h3>${icon('ai', 18)}Разбор</h3>
      ${API_BASE === 'stub' ? '<p class="fc-note">Пример: в заглушке разбор собран по шаблону из чисел карточки</p>' : ''}
      ${column('Сильное', 'check', result.strengths, 'ex-plus')}
      ${column('Слабое', 'warning', result.weaknesses, 'ex-minus')}
      ${column('Проверить на месте', 'pin', result.checks, 'ex-check')}`;
    box.onpointerover = (event) => {
      const id = event.target.closest('[data-indicators]')?.dataset.indicators.split(' ')[0];
      app.scene?.highlight(id || null);
    };
    box.onpointerleave = () => app.scene?.highlight(null);
  } catch (error) {
    box.innerHTML = `<p class="q-error">${icon('warning', 18)}${esc(error.message || 'Разбор сейчас недоступен')}</p>`;
  } finally {
    button.classList.remove('is-busy');
  }
};

// --- сравнение ---
app.screens.addCompare = (card, button) => {
  const list = compareStore.add(card);
  renderBadge(true);
  button.innerHTML = `${icon('check', 20)}<span>В сравнении</span>`;
  toast(`Добавлено к сравнению: ${list.length} из 5`);
};

app.screens.compare = async () => {
  if (body.dataset.screen === 'result') app.lastResult = app.state;
  leaveResult();
  popup.hide();
  app.state = { screen: 'compare' };
  save();
  await setScreen('compare');
  app.view?.setMode('form');
  mountCompare(sheet, {
    onOpen: (card) => {
      app.pick = { lngLat: { lat: card.point.lat, lon: card.point.lon },
        building: card.point.building ? { ...card.point.building, address: card.point.address } : null, street: null };
      app.screens.result({ screen: 'result', point: app.pick.lngLat, building: app.pick.building, params: card.params });
    },
    onBack: () => (app.lastResult ? app.screens.result(app.lastResult) : goHome()),
  });
};

// --- печать ---
app.screens.print = () => {
  const old = document.querySelector('.print-map');
  old?.remove();
  const done = () => { window.print(); };
  const map = app.view?.map;
  if (!map) return done();
  map.once('render', () => {
    try {
      const base = map.getCanvas();
      const out = document.createElement('canvas');
      out.width = base.width;
      out.height = base.height;
      const ctx = out.getContext('2d');
      ctx.drawImage(base, 0, 0);
      const smoke = document.querySelector('#smoke');
      if (smoke.width) ctx.drawImage(smoke, 0, 0, out.width, out.height);
      const img = new Image();
      img.className = 'print-map';
      img.alt = 'Карта окружения точки';
      img.src = out.toDataURL('image/jpeg', 0.86);
      sheet.querySelector('.rp')?.prepend(img);
      img.decode().catch(() => {}).then(done);
    } catch {
      done();
    }
  });
  map.triggerRepaint();
};
window.addEventListener('afterprint', () => document.querySelector('.print-map')?.remove());
renderBadge();

app.ready = start();
app.searchBox = searchBox;
app.popup = popup;
app.sheet = sheet;

// --- анкета ---
app.screens.form = async (pick, params = app.state.params ?? null) => {
  if (!pick) return;
  leaveResult();
  app.pick = pick;
  popup.hide();
  app.state = { screen: 'form', point: pick.lngLat, building: pick.building, params };
  await setScreen('form');
  app.view?.setMode('form');
  app.view?.select(pick);
  // Сброс отступов камеры от экрана карточки: иначе на телефоне здание уезжает к краю полосы.
  const narrow = matchMedia('(max-width: 860px)').matches;
  app.view?.flyTo(pick.lngLat, { zoom: narrow ? 16.6 : 17.2, pitch: narrow ? 45 : 55, bearing: -25, duration: 1100, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
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
