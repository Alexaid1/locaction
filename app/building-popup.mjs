// Мини-карточка выбранного здания или точки: адрес, три строки с иконками, «Подтвердить».
import { icon } from './icons.mjs';
import { distance, formatInt, KIND_LABEL } from './format.mjs';
import { nearestMetro } from './search.mjs';

export function popupModel(pick, stations) {
  const metro = nearestMetro(pick.lngLat.lon, pick.lngLat.lat, stations);
  const b = pick.building;
  const rows = [
    { icon: 'building', text: b ? KIND_LABEL[b.kind] ?? KIND_LABEL.unknown : 'Точка без здания' },
    { icon: 'metro', text: metro ? `${distance(metro.distance_m)} до м. ${metro.name}` : 'Метро далеко' },
  ];
  if (b?.footprint) rows.push({ icon: 'area', text: `≈ ${formatInt(b.footprint)} м² по контуру` });
  const title = b?.address ?? (pick.street ? `${pick.street}, рядом` : b ? 'Здание без адреса' : 'Точка на карте');
  return { title, rows, metro };
}

export function mountBuildingPopup(root, { onConfirm, onClose }) {
  root.classList.add('pick-card');
  root.hidden = true;
  let current = null;

  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'confirm') onConfirm(current);
    if (action === 'close') onClose();
  });

  return {
    show(pick, stations) {
      current = pick;
      const model = popupModel(pick, stations);
      root.innerHTML = `
        <button class="icon-button pick-close" type="button" data-action="close" aria-label="Закрыть">${icon('close', 18)}</button>
        <h2 class="pick-title"></h2>
        <ul class="pick-rows"></ul>
        <button class="button primary wide" type="button" data-action="confirm">${icon('check', 20)}<span>Подтвердить</span></button>`;
      root.querySelector('.pick-title').textContent = model.title;
      root.querySelector('.pick-rows').replaceChildren(...model.rows.map((row) => {
        const li = document.createElement('li');
        li.innerHTML = icon(row.icon, 20);
        li.append(row.text);
        return li;
      }));
      root.hidden = false;
      root.classList.remove('is-in');
      void root.offsetWidth;
      root.classList.add('is-in');
      root.querySelector('[data-action="confirm"]').focus({ preventScroll: true });
    },
    hide() { root.hidden = true; current = null; },
    get pick() { return current; },
  };
}
