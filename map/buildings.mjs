const source = 'buildings';
const sourceLayer = 'buildings';
const fill = 'building-fill';
const minZoom = 14;
const archive = new URL('./buildings.pmtiles', import.meta.url).href;
const categories = [
  ['residential', 'Жилое', '#8fad99'],
  ['commercial', 'Коммерческое', '#d6ab69'],
  ['mixed', 'Смешанное', '#ac9bbe'],
  ['other', 'Другое', '#a2b6c0'],
  ['unknown', 'Неизвестно', '#d5cebc'],
];
const categoryLabel = Object.fromEntries(categories.map(([key, name]) => [key, name]));
const neutral = '#d3cbb5';
const selected = ['boolean', ['feature-state', 'selected'], false];
const formatter = new Intl.NumberFormat('ru-RU');
const unavailable = 'Нет данных';

const colorByType = ['match', ['get', 'kind'],
  ...categories.filter(([key]) => key !== 'unknown').flatMap(([key, , color]) => [key, color]),
  categories.at(-1)[2]];
const fillColor = (showTypes) => ['case', selected, '#3b7561', showTypes ? colorByType : neutral];

export function addBuildingStyle(style) {
  style.sources[source] = { type: 'vector', url: `pmtiles://${archive}`, promoteId: 'osm' };
  const common = { source, 'source-layer': sourceLayer, minzoom: minZoom };
  const firstLabel = style.layers.findIndex(({ type }) => type === 'symbol');
  style.layers.splice(firstLabel, 0,
    { ...common, id: fill, type: 'fill', paint: { 'fill-color': fillColor(false), 'fill-opacity': 0.82 } },
    { ...common, id: 'building-outlines', type: 'line', paint: {
      'line-color': ['case', selected, '#214c3c', '#a49d8a'],
      'line-width': ['case', selected, 2.7, 0.6],
    } });
  return style;
}

export function attachBuildings(map, panel, locations) {
  const card = panel.querySelector('#building-card');
  const title = panel.querySelector('#building-address');
  const facts = panel.querySelector('#building-facts');
  const credit = panel.querySelector('#building-source');
  const legend = panel.querySelector('#building-legend');
  const hint = panel.querySelector('#building-hint');
  const types = panel.querySelector('#building-types');
  const demos = new Map(locations.map((location) => [location.addressSource.osm, location]));
  let selection;

  function select(id) {
    if (selection) map.removeFeatureState({ source, sourceLayer, id: selection }, 'selected');
    selection = id;
    if (selection) map.setFeatureState({ source, sourceLayer, id: selection }, { selected: true });
  }

  function show(feature) {
    const { osm, kind, footprint, address, unom, evidence } = feature.properties;
    const demo = demos.get(osm);
    select(osm);
    title.textContent = demo?.address || address || 'У здания нет адреса в OSM';
    facts.replaceChildren();
    for (const [label, value] of [
      ['УНОМ', demo?.unom || unom || unavailable],
      ['Тип по OSM', categoryLabel[kind] || categoryLabel.unknown],
      ['Площадь контура', Number.isFinite(footprint) ? `≈ ${formatter.format(footprint)} м²` : unavailable],
      ['Площадь нежилых помещений', unavailable],
      ['Площадь коммерческих помещений', unavailable],
    ]) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      facts.append(term, description);
    }
    const osmLink = document.createElement('a');
    osmLink.textContent = 'Контур в OpenStreetMap';
    osmLink.href = `https://www.openstreetmap.org/${osm}`;
    credit.replaceChildren(osmLink);
    if (evidence) credit.append(` · ${evidence}`);
    if (demo?.unom) credit.append(' · УНОМ сверён по адресному реестру');
    card.hidden = false;
    if (matchMedia('(max-width: 680px)').matches) card.scrollIntoView({ block: 'nearest' });
  }

  for (const [, label, color] of categories) {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.style.backgroundColor = color;
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, label);
    legend.append(item);
  }
  types.disabled = false;
  types.addEventListener('click', () => {
    const on = types.getAttribute('aria-pressed') === 'false';
    types.setAttribute('aria-pressed', String(on));
    legend.hidden = !on;
    map.setPaintProperty(fill, 'fill-color', fillColor(on));
  });
  panel.querySelector('#building-close').addEventListener('click', () => {
    select(null);
    card.hidden = true;
    map.getCanvas().focus({ preventScroll: true });
  });
  map.on('click', fill, (event) => {
    if (event.features?.length) show(event.features[0]);
  });
  map.on('mouseenter', fill, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', fill, () => { map.getCanvas().style.cursor = ''; });
  const updateHint = () => {
    hint.textContent = map.getZoom() < minZoom ? 'Приблизьте карту, чтобы открыть карточку здания.'
      : 'Нажмите на контур, чтобы открыть карточку здания.';
  };
  map.on('zoomend', updateHint);
  updateHint();

  return (location) => {
    const id = location.addressSource.osm;
    select(id);
    card.hidden = true;
    if (map.getZoom() < minZoom) return;
    const showLinkedContour = () => {
      if (selection !== id || map.getZoom() < minZoom) return true;
      const [feature] = map.querySourceFeatures(source, { sourceLayer, filter: ['==', ['get', 'osm'], id] });
      if (feature) show(feature);
      return Boolean(feature);
    };
    if (!showLinkedContour()) map.once('idle', showLinkedContour);
  };
}
