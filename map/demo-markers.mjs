const decimal = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function addDemoMarkers(map, engine, locations, details, onSelect) {
  const bounds = new engine.LngLatBounds();
  const markers = locations.map((location) => {
    const { lon, lat } = location.coordinates;
    const coordinates = [lon, lat];
    bounds.extend(coordinates);

    const anchor = document.createElement('div');
    anchor.className = 'demo-marker';
    const stem = document.createElement('span');
    stem.className = 'demo-marker-stem';
    stem.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.className = `demo-marker-button pin pin-${location.id.toLowerCase()}`;
    button.type = 'button';
    button.textContent = location.id;
    button.dataset.location = location.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${location.id}, ${location.address}`);
    anchor.append(stem, button);
    new engine.Marker({ element: anchor, anchor: 'center' }).setLngLat(coordinates).addTo(map);
    return { anchor, button, coordinates, location };
  });

  for (const { button, location } of markers) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      for (const marker of markers) marker.button.setAttribute('aria-pressed', String(marker.button === button));
      const address = document.createElement('strong');
      address.textContent = `${location.id} · ${location.address}`;
      const score = document.createElement('span');
      score.className = 'map-score';
      score.textContent = location.score === null ? 'Нет оценки' : `${decimal.format(location.score)} / 100`;
      details.replaceChildren(address, score);
      onSelect(location);
    });
  }

  // Separate overlapping buttons in screen space. The pins stay anchored to real coordinates.
  function spreadMarkers() {
    const projected = markers.map((marker) => ({ ...marker, point: map.project(marker.coordinates) }));
    projected.sort((a, b) => a.point.x - b.point.x);
    const crowded = projected.some(({ point }, index) =>
      projected.slice(0, index).some((other) => Math.hypot(point.x - other.point.x, point.y - other.point.y) < 52));
    const center = projected[Math.floor(projected.length / 2)].point;
    projected.forEach(({ anchor, point }, index) => {
      const x = crowded ? center.x - point.x + (index - (projected.length - 1) / 2) * 52 : 0;
      const y = crowded ? center.y - point.y - 35 : 0;
      anchor.style.setProperty('--pin-x', `${x}px`);
      anchor.style.setProperty('--pin-y', `${y}px`);
      anchor.style.setProperty('--stem-length', `${Math.hypot(x, y)}px`);
      anchor.style.setProperty('--stem-angle', `${Math.atan2(y, x)}rad`);
      anchor.classList.toggle('spread', crowded);
    });
  }

  if (markers.length) {
    map.on('move', spreadMarkers);
    map.on('resize', spreadMarkers);
    spreadMarkers();
  }
  return bounds;
}
