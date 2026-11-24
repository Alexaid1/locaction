import { PMTiles, Protocol } from './vendor/pmtiles.mjs';

const archiveURL = new URL('./osm-basemap.pmtiles', import.meta.url).href;
const source = 'basemap';
const fonts = ['Segoe UI', 'Arial', 'sans-serif'];

const lineWidth = (low, high) => ['interpolate', ['linear'], ['zoom'], 8, low, 16, high];

function roads(id, kinds, minzoom, color, low, high) {
  return {
    id, type: 'line', source, 'source-layer': 'roads', minzoom,
    filter: ['in', ['get', 'kind'], ['literal', kinds]],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': color, 'line-width': lineWidth(low, high) },
  };
}

function districtNames(id, minzoom, maxzoom, filter, size) {
  return {
    id, type: 'symbol', source, 'source-layer': 'district_labels', minzoom, maxzoom, filter,
    layout: { 'text-font': fonts, 'text-field': ['get', 'name'], 'text-size': size, 'text-padding': 4 },
    paint: { 'text-color': '#39584a', 'text-halo-color': '#f6f0dd', 'text-halo-width': 1.4 },
  };
}

export async function loadBasemap() {
  const archive = new PMTiles(archiveURL);
  const { minLon, minLat, maxLon, maxLat } = await archive.getHeader();
  const protocol = new Protocol();
  protocol.add(archive);
  return {
    tileLoader: protocol.tile,
    bounds: [[minLon, minLat], [maxLon, maxLat]],
    style: {
      version: 8,
      sources: { [source]: { type: 'vector', url: `pmtiles://${archiveURL}` } },
      layers: [
        { id: 'paper', type: 'background', paint: { 'background-color': '#f6f0e2' } },
        {
          id: 'district-fill', type: 'fill', source, 'source-layer': 'districts',
          paint: { 'fill-color': '#e5e8d7', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.85, 15, 0.4] },
        },
        {
          id: 'district-edges', type: 'line', source, 'source-layer': 'districts',
          paint: { 'line-color': '#9daa93', 'line-width': 0.85, 'line-opacity': 0.72 },
        },
        roads('paths', ['path'], 14, '#c5c7b2', 0.25, 1),
        roads('access', ['access'], 14, '#d1caba', 0.45, 1.65),
        roads('local-streets', ['street'], 12, '#c1bda9', 0.45, 2.5),
        roads('arterials', ['arterial'], 10, '#bcab88', 0.55, 3.4),
        roads('main-roads', ['major'], 7, '#a89268', 0.73, 4.2),
        districtNames('city-labels', 7, 10.7, ['==', ['get', 'prominent'], true], 10.8),
        districtNames('district-labels', 10.7, 14.8, ['has', 'name'], 12.4),
        {
          id: 'street-names', type: 'symbol', source, 'source-layer': 'roads', minzoom: 13.6,
          filter: ['has', 'name'],
          layout: {
            'symbol-placement': 'line', 'symbol-spacing': 210, 'text-field': ['get', 'name'],
            'text-font': fonts, 'text-size': 11.5, 'text-padding': 4, 'text-max-angle': 35,
            'text-rotation-alignment': 'map', 'text-keep-upright': true,
          },
          paint: { 'text-color': '#55574a', 'text-halo-color': '#f6f0df', 'text-halo-width': 1.25 },
        },
      ],
    },
  };
}
