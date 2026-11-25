// Панель карточки поверх 3D-карты: оценка, прогноз, потоки, показатели, действия.
import { icon } from './icons.mjs';
import { panelModel } from './panel-model.mjs';
import { animate } from './map-view.mjs';

const esc = (text) => String(text ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const RING = 2 * Math.PI * 52;

function forecastHtml(f) {
  if (f.kind === 'validated') {
    return `
      <div class="fc">
        <p class="fc-label">${icon('clock', 18)}Проработает год</p>
        <p class="fc-value"><strong data-count="${f.pct}">0</strong><span>%</span></p>
        <div class="fc-bar" role="img" aria-label="Интервал ${f.low}-${f.high}%, в среднем по городу ${f.city ?? '-'}%">
          <span class="fc-band" style="--a:${f.low}%; --b:${f.high}%"></span>
          <span class="fc-mark" style="--p:${f.pct}%"></span>
          ${f.city === null ? '' : `<span class="fc-city" style="--p:${f.city}%"><em>город ${f.city}%</em></span>`}
        </div>
        <p class="fc-note">${f.low}-${f.high}% - интервал</p>
      </div>`;
  }
  return `
    <div class="fc fc-pending">
      <p class="fc-label">${icon('clock', 18)}Прогноз на год</p>
      <p class="fc-wait">Пока недоступен</p>
      <p class="fc-note">${esc(f.message)}</p>
    </div>`;
}

export function mountResultPanel(root, card, handlers) {
  const m = panelModel(card);
  root.innerHTML = `
    <div class="rp" data-sheet="peek">
      <button class="rp-handle" type="button" data-action="sheet" aria-label="Свернуть или развернуть карточку"><span></span></button>
      ${m.banner ? `<p class="rp-banner">${icon('warning', 16)}${esc(m.banner)}</p>` : ''}
      <header class="rp-head">
        <p class="eyebrow">${esc(m.subtitle)}</p>
        <h2 class="rp-title">${esc(m.title)}</h2>
      </header>
      <section class="rp-top">
        <div class="score" role="img" aria-label="Оценка места ${m.score?.value ?? 'нет'} из 100">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="score-track" cx="60" cy="60" r="52"/>
            <circle class="score-fill" cx="60" cy="60" r="52" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/>
          </svg>
          <p class="score-num"><strong data-count="${Math.round(m.score?.value ?? 0)}">0</strong><span>из 100</span></p>
          <p class="score-label">Оценка места</p>
        </div>
        ${forecastHtml(m.forecast)}
      </section>
      <section class="rp-flows">
        <div class="rp-h">
          <h3>${icon('flow', 18)}Поток мимо</h3>
          <span class="tag-estimate">${esc(m.flows.label)}</span>
        </div>
        <div class="periods" role="radiogroup" aria-label="Время суток">
          ${m.flows.bars.map((b, i) => `
            <button type="button" class="period" role="radio" aria-checked="${i === 0}" data-period="${b.id}">
              ${icon(b.icon, 20)}<span class="period-name">${b.label}</span><span class="period-hours">${b.hours}</span>
              <span class="period-bar"><span style="--w:${Math.round(b.rel * 100)}%"></span></span>
            </button>`).join('')}
        </div>
        ${m.flows.numbers ? `<p class="fc-note">${esc(m.flows.numbers)}</p>` : ''}
      </section>
      <section class="rp-rows">
        <h3>${icon('pin', 18)}Что вокруг</h3>
        <ul>
          ${m.rows.map((r, i) => `
            <li class="row" tabindex="0" style="--i:${i}" data-indicator="${r.id}" data-effect="${r.effect}">
              <span class="row-icon">${icon(r.icon, 20)}</span>
              <span class="row-label">${esc(r.label)}${r.zone ? `<small>${esc(r.zone)}</small>` : ''}</span>
              <span class="row-value">${esc(r.value)}</span>
              ${r.bar === null ? '' : `<span class="row-bar" title="Лучше, чем у ${Math.round(r.bar * 100)}% точек Москвы"><span style="--w:${Math.round(r.bar * 100)}%"></span></span>`}
            </li>`).join('')}
        </ul>
        <p class="fc-note">${icon('competitor', 14)}мешает · ${icon('anchor', 14)}помогает · ${esc(m.method)}</p>
      </section>
      <section class="rp-explain" hidden></section>
      <footer class="rp-actions">
        <button type="button" class="button primary" data-action="explain">${icon('ai', 20)}<span>Разбор от ИИ</span></button>
        <button type="button" class="button secondary" data-action="add-compare" title="Добавить к сравнению">${icon('compare', 20)}<span>Сравнить</span></button>
        <button type="button" class="icon-button" data-action="print" aria-label="Сохранить PDF">${icon('print', 20)}</button>
        <button type="button" class="icon-button" data-action="new-point" aria-label="Новая точка">${icon('plus', 20)}</button>
      </footer>
    </div>`;

  const panel = root.querySelector('.rp');
  const fill = root.querySelector('.score-fill');
  animate(900, (t) => {
    const e = 1 - (1 - t) ** 3;
    fill.setAttribute('stroke-dashoffset', String(RING * (1 - (m.score?.ring ?? 0) * e)));
    root.querySelectorAll('[data-count]').forEach((el) => { el.textContent = String(Math.round(Number(el.dataset.count) * e)); });
  });

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.period) {
      root.querySelectorAll('.period').forEach((p) => p.setAttribute('aria-checked', String(p === button)));
      handlers.onPeriod?.(button.dataset.period);
    }
    const action = button.dataset.action;
    if (action === 'sheet') panel.dataset.sheet = panel.dataset.sheet === 'full' ? 'peek' : 'full';
    if (action === 'explain') handlers.onExplain?.(root.querySelector('.rp-explain'), button);
    if (action === 'add-compare') handlers.onCompare?.(button);
    if (action === 'print') handlers.onPrint?.();
    if (action === 'new-point') handlers.onNew?.();
  });
  const hover = (event) => {
    const row = event.target.closest('[data-indicator]');
    handlers.onHighlight?.(row?.dataset.indicator ?? null);
  };
  root.addEventListener('pointerover', hover);
  root.addEventListener('focusin', hover);
  root.addEventListener('pointerleave', () => handlers.onHighlight?.(null));
  return { model: m };
}
