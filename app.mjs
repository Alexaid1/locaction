import { compareLeaders, compareLocations, factors, format, indexLabel, missingRule } from './methodology.mjs';

const start = document.querySelector('#start');
const report = document.querySelector('#report');
const reportTitle = document.querySelector('#report-title');
const loadError = document.querySelector('#load-error');
const decimal = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const date = (iso) => iso.split('-').reverse().join('.');
let demo;

function loadDemo() {
  demo ??= fetch(new URL('./demo-data.json', import.meta.url)).then(async (response) => {
    if (!response.ok) throw new Error(`Demo data: HTTP ${response.status}`);
    const data = await response.json();
    return { data, comparison: compareLocations(data.locations) };
  }).catch((error) => {
    demo = undefined;
    throw error;
  });
  return demo;
}

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function renderRanking(ranked) {
  const ranking = document.querySelector('#ranking');
  ranking.replaceChildren();
  for (const location of ranked) {
    const card = element('li', undefined, 'rank-card');
    card.dataset.location = location.id;
    if (location.rank === 1) card.classList.add('rank-first');

    const top = element('div', undefined, 'rank-top');
    top.append(element('span', location.id, `pin pin-${location.id.toLowerCase()}`));
    if (location.rank) top.append(element('span', `${location.rank}-е место`, 'place'));

    const info = element('div', undefined, 'rank-info');
    info.append(element('p', location.scenario, 'rank-scenario'), element('h4', location.address));

    const score = element('div', undefined, 'score');
    const value = element('strong', location.score === null ? 'Нет оценки' : decimal.format(location.score), 'score-value');
    score.append(value);
    if (location.score !== null) score.append(element('span', ' / 100', 'score-max'));
    card.append(top, info, score);
    ranking.append(card);
  }
}

function renderCoverage({ excluded, includedCount, includedWeight }) {
  const coverage = document.querySelector('#coverage');
  const summary = `Данные по всем адресам есть для ${includedCount} из ${factors.length} факторов (${includedWeight}% исходного веса).`;
  coverage.replaceChildren();
  if (includedWeight < 100) {
    const status = includedCount ? 'Предварительный рейтинг' : 'Нет оценки';
    coverage.append(element('strong', status), ' · ');
  }
  coverage.append(summary);
  coverage.classList.toggle('incomplete', includedWeight < 100);

  const list = document.querySelector('#excluded-factors');
  list.replaceChildren();
  for (const { factor, unavailable } of excluded) {
    const item = element('li');
    const addresses = unavailable.map(({ address, reason }) => reason ? `${address} (${reason})` : address);
    item.append(element('strong', factor.label), ' — ', addresses.join(', '));
    list.append(item);
  }
  document.querySelector('#exclusions').hidden = excluded.length === 0;
}

function renderCafeDetails(container, locations, source) {
  const citation = element('p', undefined, 'cafe-source');
  const link = element('a', 'OpenStreetMap');
  link.href = source.url;
  citation.append('Источник · ', link, `, срез от ${date(source.date)}. Тег amenity=cafe, радиус 300 м.`);
  container.append(citation);

  const grid = element('div', undefined, 'cafe-grid');
  for (const location of locations) {
    const block = element('div');
    block.append(element('h4', `${location.id} · ${location.address}`));
    const { value } = location.measures.competitors;
    const objects = location.metrics?.competitors?.objects;
    if (value === null || value === 0 || !objects?.length) {
      const message = value === null ? 'Данные недоступны.'
        : value === 0 ? 'В выгрузке не найдено кафе.' : 'Список объектов недоступен.';
      block.append(element('p', message));
    } else {
      const list = element('ul');
      for (const object of objects) {
        const name = object.name || 'Кафе без названия';
        const item = element('li');
        if (/^(node|way|relation)\/\d+$/.test(object.osm)) {
          const cafe = element('a', name);
          cafe.href = `https://www.openstreetmap.org/${object.osm}`;
          item.append(cafe);
        } else {
          item.textContent = name;
        }
        list.append(item);
      }
      block.append(list);
    }
    grid.append(block);
  }
  container.append(grid);
}

function renderFactors(locations, effectiveWeights, cafeSource) {
  const head = document.querySelector('#factor-head');
  const body = document.querySelector('#factor-body');
  head.replaceChildren(head.firstElementChild);
  body.replaceChildren();
  for (const location of locations) {
    const column = element('th', location.id);
    column.scope = 'col';
    column.setAttribute('aria-label', `${location.id}, ${location.address}`);
    column.append(element('span', location.address, 'table-address'));
    head.append(column);
  }

  for (const factor of factors) {
    const row = element('tr');
    row.dataset.factor = factor.id;
    const label = element('th');
    label.scope = 'row';
    const weight = effectiveWeights[factor.id];
    const weightLabel = weight === undefined ? `${factor.weight}% · исключён`
      : weight === factor.weight ? `${weight}%` : `${factor.weight}% → ${decimal.format(weight)}%`;
    const toggle = element('button', factor.label, 'factor-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', `details-${factor.id}`);
    label.append(toggle, element('span', factor.label, 'print-factor-name'), element('span', weightLabel, 'factor-weight'));
    label.append(element('small', `${factor.scope}. ${factor.rule}`, 'print-rule'));
    row.append(label);
    for (const location of locations) {
      const { value, contribution } = location.measures[factor.id];
      const cell = element('td');
      cell.dataset.location = location.id;
      const raw = value === null ? 'Нет данных' : `${value}${factor.unit ? ` ${factor.unit}` : ''}`;
      const points = contribution === null ? 'Вне индекса' : `+${decimal.format(contribution)}`;
      cell.append(element('span', raw, 'raw-value'), element('span', points, 'contribution'));
      row.append(cell);
    }

    const details = element('tr', undefined, 'factor-details');
    details.id = `details-${factor.id}`;
    details.hidden = true;
    const detailCell = element('td');
    detailCell.colSpan = locations.length + 1;
    detailCell.append(element('p', `${factor.scope}. ${factor.rule}`));
    if (factor.id === 'competitors') renderCafeDetails(detailCell, locations, cafeSource);
    details.append(detailCell);
    toggle.addEventListener('click', () => {
      details.hidden = !details.hidden;
      toggle.setAttribute('aria-expanded', String(!details.hidden));
    });
    body.append(row, details);
  }
  document.querySelector('#missing-rule').textContent = missingRule;
}

function renderTradeoffs(ranked) {
  const title = document.querySelector('#tradeoffs-title');
  const summary = document.querySelector('#leader-summary');
  const list = document.querySelector('#tradeoffs');
  list.replaceChildren();
  const pair = compareLeaders(ranked);
  if (!pair) {
    title.textContent = 'Почему нет рейтинга';
    summary.textContent = 'Для сравнения нужен хотя бы один фактор с данными по всем трём адресам.';
    return;
  }

  const { first, second, firstAdvantage, secondAdvantage } = pair;
  const tied = first.rank === second.rank;
  title.textContent = tied ? 'Адреса делят первое место' : 'Почему этот адрес первый';
  summary.textContent = tied
    ? `Демо-индекс у лидеров совпадает после округления: ${decimal.format(first.score)}.`
    : `${first.address} набирает ${decimal.format(first.score)}. Следом ${second.address} с ${decimal.format(second.score)}.`;

  for (const [location, other, advantage, label] of [
    [first, second, firstAdvantage, tied ? first.address : 'Главное преимущество лидера'],
    [second, first, secondAdvantage, tied ? second.address : 'Где второй адрес сильнее'],
  ]) {
    const item = element('li', undefined, 'advantage');
    item.append(element('p', label, 'advantage-label'));
    if (advantage) {
      const { factor, delta } = advantage;
      item.dataset.factor = factor.id;
      const gap = Math.abs(delta);
      const points = gap < 0.05 ? '< 0,1 балла' : `+${decimal.format(gap)} балла`;
      item.append(element('h4', factor.label), element('p', points, 'advantage-points'));
      const raw = ({ measures }) => `${measures[factor.id].value}${factor.unit ? ` ${factor.unit}` : ''}`;
      item.append(element('p', `${location.id} · ${raw(location)} / ${other.id} · ${raw(other)}`, 'advantage-values'));
    } else {
      item.append(element('p', 'Преимущества по отдельному фактору нет.'));
    }
    list.append(item);
  }
}

function renderReport({ data, comparison }) {
  const { ranked, effectiveWeights } = comparison;
  const { cafeSnapshot, mitinoExtract } = data.sources;
  document.querySelector('#report-place').textContent = `${data.city}, район ${data.district}`;
  document.querySelector('#report-format').textContent = `${format} · ${ranked.length} адреса`;
  document.querySelector('#ranking-title').textContent = indexLabel;
  renderCoverage(comparison);
  renderRanking(ranked);
  renderTradeoffs(ranked);
  renderFactors(ranked, effectiveWeights, cafeSnapshot);

  document.querySelector('#sources-summary').textContent = `Кафе и кофейни взяты из среза OSM от ${date(cafeSnapshot.date)}. Координаты зданий и остальные объекты взяты из выгрузки OSM по Митино от ${date(mitinoExtract.date)}. Объекты притяжения включают супермаркеты, ТЦ, фитнес-центры, клиники и больницы.`;
}

start.addEventListener('click', async () => {
  if (report.hidden) {
    start.disabled = true;
    loadError.hidden = true;
    start.setAttribute('aria-busy', 'true');
    try {
      renderReport(await loadDemo());
      report.hidden = false;
    } catch (error) {
      console.error(error);
      loadError.hidden = false;
      return;
    } finally {
      start.disabled = false;
      start.removeAttribute('aria-busy');
    }
  }

  reportTitle.focus({ preventScroll: true });
  report.scrollIntoView({ block: 'start' });
});

document.querySelector('#print').addEventListener('click', () => window.print());

const mapPanel = document.querySelector('#location-map');
import('./map/map.mjs').then(({ mountLocationMap }) => mountLocationMap(mapPanel, loadDemo)).catch(() => {
  mapPanel.dataset.state = 'fallback';
});
