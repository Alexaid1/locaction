// Экран сравнения точек и значок со счётчиком в шапке.
import { categoryById } from '../api/stub/osm-categories.mjs';
import { compareModel, compareStore } from './compare-model.mjs';
import { icon } from './icons.mjs';

const esc = (text) => String(text ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
export const store = compareStore();

export function renderBadge(bump = false) {
  const badge = document.querySelector('.compare-badge');
  const count = store.list().length;
  badge.hidden = count === 0;
  badge.querySelector('.compare-count').textContent = String(count);
  if (bump) { badge.classList.remove('is-bump'); void badge.offsetWidth; badge.classList.add('is-bump'); }
}

export function mountCompare(root, { onOpen, onBack }) {
  function render() {
    const rows = compareModel(store.list());
    root.innerHTML = `
      <div class="cmp">
        <header class="cmp-head">
          <button type="button" class="icon-button" data-action="cmp-back" aria-label="Назад">${icon('back', 20)}</button>
          <h2 class="q-title">Сравнение</h2>
          <span class="cmp-count">${rows.length} из 5</span>
        </header>
        ${rows.length ? '' : `<p class="cmp-empty">${icon('compare', 22)}Добавьте точки кнопкой «Сравнить» в карточке.</p>`}
        <div class="cmp-grid">
          ${rows.map((r, i) => `
            <article class="cmp-card" style="--i:${i}">
              <h3>${esc(r.address)}</h3>
              <p class="meta">${esc(categoryById.get(r.category)?.label ?? '')}</p>
              <div class="cmp-score" style="--v:${r.score ?? 0}"><strong>${r.score ?? '-'}</strong><span>оценка</span></div>
              <p class="cmp-fc">${icon('clock', 16)}${r.forecast === null ? 'Прогноз пока недоступен' : `Проработает год: <strong>${r.forecast}%</strong>`}</p>
              <ul>${r.top.map((t) => `<li data-effect="${t.effect}">${icon(t.icon, 16)}<span>${esc(t.label)}</span><strong>${esc(t.value)}</strong></li>`).join('')}</ul>
              <div class="cmp-actions">
                <button type="button" class="button secondary" data-open="${r.card_id}">${icon('arrow', 18)}<span>Открыть</span></button>
                <button type="button" class="icon-button" data-remove="${r.card_id}" aria-label="Убрать из сравнения">${icon('close', 18)}</button>
              </div>
            </article>`).join('')}
        </div>
      </div>`;
  }
  root.onclick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.remove) { store.remove(button.dataset.remove); renderBadge(); render(); }
    if (button.dataset.open) onOpen(store.list().find((c) => c.card_id === button.dataset.open));
    if (button.dataset.action === 'cmp-back') onBack();
  };
  render();
}
