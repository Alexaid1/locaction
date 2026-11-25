// Экран «Что открываете?»: плитки категорий и чипы или свободный текст с разбором.
import { CATEGORIES, GROUPS } from '../api/stub/osm-categories.mjs';
import { icon } from './icons.mjs';
import { AUDIENCE, DAYS, FORMATS, OWNERSHIP, canSubmit, emptyForm, formToParams, paramChips, paramsToForm } from './form-model.mjs';

const esc = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const hh = (n) => `${String(n).padStart(2, '0')}:00`;
const hourOf = (time) => (time ? Number(time.slice(0, 2)) : null);

function chip({ value, text, iconName, pressed, field }) {
  return `<button type="button" class="chip" data-field="${field}" data-value="${value}" aria-pressed="${pressed}">${iconName ? icon(iconName, 18) : ''}<span>${esc(text)}</span></button>`;
}

export function mountQuestionnaire(root, { address, initial, parse, onSubmit }) {
  let form = initial ? paramsToForm(initial) : emptyForm();
  let group = CATEGORIES.find((c) => c.id === form.category_id)?.group ?? null;
  let tab = initial?.source === 'text' ? 'text' : 'form';
  let parsed = initial?.source === 'text' ? initial : null;

  root.innerHTML = `
    <div class="q">
      <p class="eyebrow q-address">${icon('pin', 16)}<span></span></p>
      <h2 class="q-title">Что открываете?</h2>
      <div class="segmented" role="tablist">
        <button type="button" role="tab" data-tab="form">${icon('form', 18)}Анкета</button>
        <button type="button" role="tab" data-tab="text">${icon('text', 18)}Своими словами</button>
      </div>
      <section class="q-pane" data-pane="form"></section>
      <section class="q-pane" data-pane="text">
        <label class="q-textarea">
          <span class="sr-only">Опишите бизнес</span>
          <textarea rows="5" maxlength="2000" placeholder="Кофейня навынос, чек около 350 ₽, с 7 до 21 без выходных. Гости - люди у метро и мамы с колясками."></textarea>
        </label>
        <button type="button" class="button secondary" data-action="parse">${icon('ai', 20)}<span>Разобрать</span></button>
        <div class="q-parsed" aria-live="polite"></div>
      </section>
      <div class="q-submit">
        <p class="q-need" hidden>${icon('warning', 16)}Выберите тип бизнеса</p>
        <button type="button" class="button primary" data-action="submit">${icon('arrow', 20)}<span>Рассчитать</span></button>
      </div>
    </div>`;

  root.querySelector('.q-address span').textContent = address;
  const paneForm = root.querySelector('[data-pane="form"]');
  const paneText = root.querySelector('[data-pane="text"]');
  const parsedBox = root.querySelector('.q-parsed');
  const textarea = root.querySelector('textarea');
  const submit = root.querySelector('[data-action="submit"]');
  const need = root.querySelector('.q-need');
  if (form.raw_text) textarea.value = form.raw_text;

  function renderTabs() {
    root.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    paneForm.hidden = tab !== 'form';
    paneText.hidden = tab !== 'text';
  }

  function renderForm() {
    const tiles = group ? CATEGORIES.filter((c) => c.group === group) : [];
    const checkSet = form.avg_check_rub !== null;
    const hoursSet = form.open !== null && form.close !== null;
    paneForm.innerHTML = `
      <div class="q-block" data-block="category_id">
        <div class="groups">${GROUPS.map((g) => `
          <button type="button" class="group" data-group="${g.id}" aria-pressed="${g.id === group}">${icon(g.icon, 28)}<span>${g.label}</span></button>`).join('')}
        </div>
        <div class="tiles">${tiles.map((c, i) => `
          <button type="button" class="tile" style="--i:${i}" data-field="category_id" data-value="${c.id}" aria-pressed="${c.id === form.category_id}">${icon(c.icon, 30)}<span>${c.label}</span></button>`).join('')}
        </div>
      </div>
      <div class="q-details" ${form.category_id ? '' : 'hidden'}>
        <div class="q-block" data-block="format">
          <h3>${icon('form', 18)}Формат</h3>
          <div class="chips">${FORMATS.map(([value, text, ic]) => chip({ field: 'format', value, text, iconName: ic, pressed: form.format === value })).join('')}</div>
        </div>
        <div class="q-block" data-block="avg_check_rub">
          <h3>${icon('wallet', 18)}Средний чек <output class="q-value">${checkSet ? `${esc(Number(form.avg_check_rub).toLocaleString('ru-RU'))} ₽` : 'не указан'}</output></h3>
          <input type="range" class="range ${checkSet ? '' : 'is-unset'}" data-range="check" min="100" max="5000" step="50" value="${esc(form.avg_check_rub ?? 500)}" aria-label="Средний чек, рублей">
        </div>
        <div class="q-block" data-block="hours">
          <h3>${icon('clock', 18)}Часы работы <output class="q-value">${hoursSet ? `${esc(form.open)}-${esc(form.close)}` : 'не указаны'}</output></h3>
          <div class="dual ${hoursSet ? '' : 'is-unset'}">
            <input type="range" class="range" data-range="open" min="0" max="23" step="1" value="${hourOf(form.open) ?? 8}" aria-label="Открытие, час">
            <input type="range" class="range" data-range="close" min="1" max="24" step="1" value="${hourOf(form.close) ?? 22}" aria-label="Закрытие, час">
          </div>
          <div class="chips">${DAYS.map(([value, text]) => chip({ field: 'days', value, text, pressed: hoursSet && form.days === value })).join('')}</div>
        </div>
        <div class="q-block" data-block="audience">
          <h3>${icon('users', 18)}Кто ваши гости</h3>
          <div class="chips">${AUDIENCE.map(([value, text, ic]) => chip({ field: 'audience', value, text, iconName: ic, pressed: form.audience.has(value) })).join('')}</div>
        </div>
        <details class="q-more" ${form.area_m2 || form.ownership ? 'open' : ''} data-block="area_m2">
          <summary>${icon('plus', 18)}Ещё: площадь и формат владения</summary>
          <label class="q-area">${icon('area', 18)}<span>Площадь, м²</span><input type="number" min="1" max="10000" inputmode="numeric" data-input="area" value="${esc(form.area_m2 ?? '')}"></label>
          <div class="chips" data-block="ownership">${OWNERSHIP.map(([value, text]) => chip({ field: 'ownership', value, text, pressed: form.ownership === value })).join('')}</div>
        </details>
      </div>`;
    renderSubmit();
  }

  function renderParsed() {
    if (!parsed) { parsedBox.innerHTML = ''; return; }
    parsedBox.innerHTML = `<h3>Мы поняли так</h3><p class="q-hint">Нажмите на параметр, чтобы поправить. Жёлтые - не указаны.</p>
      <div class="chips">${paramChips(parsed).map((c, i) => `
        <button type="button" class="chip result-chip ${c.missing ? 'is-missing' : 'is-found'}" style="--i:${i}" data-goto="${c.field}">${icon(c.icon, 18)}<span>${esc(c.label)}</span></button>`).join('')}
      </div>`;
  }

  function renderSubmit() {
    const ok = canSubmit(form);
    submit.disabled = !ok;
    need.hidden = ok;
  }

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.tab) {
      tab = target.dataset.tab;
      if (tab === 'text' && parsed) { parsed = formToParams(form); renderParsed(); }
      renderTabs();
      return;
    }
    if (target.dataset.group) { group = target.dataset.group; renderForm(); return; }
    if (target.dataset.goto) {
      tab = 'form';
      renderTabs();
      renderForm();
      paneForm.querySelector(`[data-block="${target.dataset.goto}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      paneForm.querySelector(`[data-block="${target.dataset.goto}"]`)?.classList.add('is-flash');
      return;
    }
    const { field, value } = target.dataset;
    if (field === 'category_id') { form.category_id = value; form.source = parsed ? form.source : 'form'; renderForm(); paneForm.querySelector('.q-details')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    else if (field === 'format' || field === 'ownership') { form[field] = form[field] === value ? null : value; renderForm(); }
    else if (field === 'days') { form.days = value; if (!form.open) { form.open = '08:00'; form.close = '22:00'; } renderForm(); }
    else if (field === 'audience') { if (form.audience.has(value)) form.audience.delete(value); else form.audience.add(value); renderForm(); }
    else if (target.dataset.action === 'parse') {
      const text = textarea.value.trim();
      if (!text) { textarea.focus(); return; }
      target.disabled = true;
      target.classList.add('is-busy');
      parsedBox.innerHTML = '<div class="shimmer"></div>';
      try {
        const { params } = await parse(text);
        parsed = params;
        form = paramsToForm(params);
        group = CATEGORIES.find((c) => c.id === form.category_id)?.group ?? null;
        renderParsed();
        renderForm();
      } catch {
        parsedBox.innerHTML = `<p class="q-error">${icon('warning', 18)}Не получилось разобрать. Заполните анкету.</p>`;
      } finally {
        target.disabled = false;
        target.classList.remove('is-busy');
      }
    } else if (target.dataset.action === 'submit') {
      if (!canSubmit(form)) { renderSubmit(); return; }
      onSubmit(formToParams(form));
    }
  });

  root.addEventListener('input', (event) => {
    const range = event.target.dataset.range;
    if (range === 'check') {
      form.avg_check_rub = Number(event.target.value);
      event.target.classList.remove('is-unset');
      event.target.closest('.q-block').querySelector('.q-value').textContent = `${form.avg_check_rub.toLocaleString('ru-RU')} ₽`;
    } else if (range === 'open' || range === 'close') {
      const block = event.target.closest('.q-block');
      let open = Number(block.querySelector('[data-range="open"]').value);
      let close = Number(block.querySelector('[data-range="close"]').value);
      if (open >= close) { if (range === 'open') close = Math.min(24, open + 1); else open = Math.max(0, close - 1); }
      block.querySelector('[data-range="open"]').value = open;
      block.querySelector('[data-range="close"]').value = close;
      form.open = hh(open);
      form.close = hh(close);
      block.querySelector('.dual').classList.remove('is-unset');
      block.querySelector('.q-value').textContent = `${form.open}-${form.close}`;
    } else if (event.target.dataset.input === 'area') {
      const n = Number(event.target.value);
      form.area_m2 = n >= 1 && n <= 10000 ? n : null;
    }
  });

  renderTabs();
  renderForm();
  renderParsed();
  return { get params() { return formToParams(form); } };
}
