// Строка поиска адреса с подсказками и управлением с клавиатуры.
import { createSearch } from './search.mjs';
import { icon } from './icons.mjs';

export function mountSearchBox(root, { onChoose, onFocus }) {
  const search = createSearch(new URL('../map/addresses/', import.meta.url));
  root.classList.add('search');
  root.innerHTML = `
    <label class="search-field">
      ${icon('search', 20)}
      <span class="sr-only">Адрес в Москве</span>
      <input type="search" autocomplete="off" spellcheck="false" placeholder="Улица и дом, например Дубравная 36"
        role="combobox" aria-expanded="false" aria-controls="search-list" aria-autocomplete="list">
    </label>
    <ul class="search-list" id="search-list" role="listbox" hidden></ul>
    <p class="search-empty" role="status" hidden>Не нашли адрес. Кликните по карте</p>`;
  const input = root.querySelector('input');
  const list = root.querySelector('.search-list');
  const empty = root.querySelector('.search-empty');
  let rows = [];
  let active = -1;
  let ticket = 0;
  let timer;

  function close() {
    list.hidden = true;
    empty.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  }

  function render() {
    list.replaceChildren(...rows.map((row, i) => {
      const item = document.createElement('li');
      item.id = `search-option-${i}`;
      item.role = 'option';
      item.setAttribute('aria-selected', String(i === active));
      const [street, ...rest] = row.a.split(', ');
      item.innerHTML = `${icon('pin', 18)}<span><strong></strong> <span class="search-house"></span></span>`;
      item.querySelector('strong').textContent = street;
      item.querySelector('.search-house').textContent = rest.join(', ');
      item.addEventListener('pointerdown', (event) => { event.preventDefault(); choose(i); });
      return item;
    }));
    list.hidden = rows.length === 0;
    input.setAttribute('aria-expanded', String(rows.length > 0));
    input.setAttribute('aria-activedescendant', active >= 0 ? `search-option-${active}` : '');
  }

  function choose(index) {
    const row = rows[index];
    if (!row) return;
    input.value = row.a;
    close();
    input.blur();
    onChoose(row);
  }

  input.addEventListener('focus', () => onFocus?.());
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) { rows = []; render(); empty.hidden = true; return; }
    timer = setTimeout(async () => {
      const mine = ++ticket;
      let found = [];
      try { found = await search.suggest(query); } catch { found = []; }
      if (mine !== ticket) return;
      rows = found;
      active = rows.length ? 0 : -1;
      render();
      empty.hidden = rows.length > 0 || query.length < 3;
    }, 120);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!rows.length) return;
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(Math.max(0, active));
    } else if (event.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));

  return { input, clear() { input.value = ''; rows = []; close(); }, set(value) { input.value = value ?? ''; } };
}
