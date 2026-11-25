// «Дым» потоков и линии влияния на холсте поверх карты. Иллюстрация, не замер.
import { buildPaths, spawnWeights, positionAt, particleBudget, bezier } from './smoke-math.mjs';

const TRAIL = 7;
const SPEED_SCALE = 12;
const MAX_LINES = 40;
const HUB = 30;
const SMOKE = '255, 214, 150';
const PLUS = '127, 214, 171';
const MINUS = '232, 128, 96';

export function createSmoke(map, canvas, { segments, points, center, reducedMotion }) {
  const ctx = canvas.getContext('2d');
  const paths = buildPaths(segments);
  const lines = points.slice(0, MAX_LINES).map((p, i) => ({ ...p, phase: (i * 0.137) % 1 }));
  let period = 'morning';
  let weights = spawnWeights(paths, segments, period);
  let fromWeights = weights;
  let blendStart = 0;
  let cumulative = cumulate(weights);
  let hotKinds = [];
  let hiddenKinds = [];
  let alive = true;
  let raf = 0;
  let last = performance.now();
  let slow = 0;
  const mean = (p) => {
    const fs = segments?.features ?? [];
    return fs.length ? fs.reduce((s, f) => s + (f.properties[p] ?? 0), 0) / fs.length : 0;
  };
  const softBudget = (p) => Math.round(particleBudget(mean(p)) * 0.8);
  let budget = paths.length ? softBudget(period) : 0;
  const particles = [];

  function cumulate(w) {
    const out = new Float64Array(w.length);
    let acc = 0;
    for (let i = 0; i < w.length; i++) { acc += w[i]; out[i] = acc; }
    return out;
  }

  function pick() {
    const r = Math.random() * (cumulative.at(-1) || 1);
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < r) lo = mid + 1; else hi = mid; }
    return lo;
  }

  function spawn(p = {}) {
    p.path = pick();
    const path = paths[p.path];
    p.dir = Math.random() < 0.5 ? 1 : -1;
    p.s = Math.random() * path.length_m;
    p.speed = (1.1 + Math.random() * 0.5) * SPEED_SCALE;
    p.trail = [];
    p.alpha = 0.28 + Math.random() * 0.3;
    return p;
  }

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Линии влияния гаснут, не доходя до точки: вокруг неё остаётся тихое кольцо, а не яркая «звезда».
  function drawLines(now, animated) {
    const c = map.project([center.lon, center.lat]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255, 230, 168, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, HUB, 0, Math.PI * 2);
    ctx.stroke();
    for (const line of lines) {
      if (hiddenKinds.includes(line.kind)) continue;
      const a = map.project([line.lon, line.lat]);
      const len = Math.hypot(a.x - c.x, a.y - c.y);
      if (len < HUB * 1.6) continue;
      const lift = Math.min(80, len * 0.3);
      const ctrl = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 - lift };
      const tEnd = Math.max(0.2, 1 - (HUB * 1.25) / len);
      const end = bezier(a, ctrl, c, tEnd);
      const color = line.effect === 'minus' ? MINUS : PLUS;
      const hot = hotKinds.length === 0 || hotKinds.includes(line.kind);
      const base = hotKinds.length === 0 ? 0.4 : hot ? 0.85 : 0.06;
      const g = ctx.createLinearGradient(a.x, a.y, end.x, end.y);
      g.addColorStop(0, `rgba(${color}, ${base})`);
      g.addColorStop(1, `rgba(${color}, ${base * 0.25})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.9 + 2.2 * line.strength;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (let k = 1; k <= 16; k++) { const q = bezier(a, ctrl, c, (k / 16) * tEnd); ctx.lineTo(q.x, q.y); }
      ctx.stroke();
      if (animated && hot) {
        const t = (((now / 2800) + line.phase) % 1) * tEnd;
        const q = bezier(a, ctrl, c, t);
        const fade = Math.sqrt(1 - t / tEnd);
        ctx.fillStyle = `rgba(${color}, ${0.75 * fade})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 2.4 + 1.8 * line.strength, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Мягкое свечение улиц под частицами - слой карты (видеокарта), ярче там, где поток сильнее.
  const glowWidth = (p) => ['interpolate', ['linear'], ['get', p], 0, 0, 1, 14];
  if (segments?.features?.length && !map.getSource('flow-glow')) {
    map.addSource('flow-glow', { type: 'geojson', data: segments });
    map.addLayer({ id: 'flow-glow', type: 'line', source: 'flow-glow', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffd98a', 'line-width': glowWidth(period), 'line-blur': 8, 'line-opacity': 0.2,
        'line-width-transition': { duration: 600 } } }, 'city-3d');
  }

  function drawStatic() {
    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const features = segments?.features ?? [];
    for (let i = 0; i < paths.length; i++) {
      const v = features[i].properties[period];
      ctx.strokeStyle = `rgba(${SMOKE}, ${0.08 + 0.5 * v})`;
      ctx.lineWidth = 1 + 3 * v;
      ctx.beginPath();
      paths[i].coords.forEach(([x, y], k) => { const q = map.project([x, y]); if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.stroke();
    }
    drawLines(0, false);
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (dt > 1 / 38) { slow++; if (slow > 30) { budget = Math.max(40, Math.round(budget * 0.8)); slow = 0; } } else slow = Math.max(0, slow - 1);

    if (blendStart) {
      const t = Math.min(1, (now - blendStart) / 600);
      const target = spawnWeights(paths, segments, period);
      weights = target.map((v, i) => fromWeights[i] + (v - fromWeights[i]) * t);
      cumulative = cumulate(weights);
      if (t >= 1) blendStart = 0;
    }
    while (particles.length < budget) particles.push(spawn());
    if (particles.length > budget) particles.length = budget;

    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of particles) {
      const path = paths[p.path];
      p.s += p.dir * p.speed * dt;
      if (p.s < 0 || p.s > path.length_m) { spawn(p); continue; }
      p.trail.push(map.project(positionAt(path, p.s)));
      if (p.trail.length > TRAIL) p.trail.shift();
      let prev = null;
      for (let k = 0; k < p.trail.length; k++) {
        const q = p.trail[k];
        if (prev) {
          const f = k / p.trail.length;
          ctx.strokeStyle = `rgba(${SMOKE}, ${p.alpha * f * 0.75})`;
          ctx.lineWidth = 1 + 2.2 * f;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        prev = q;
      }
      if (prev) {
        ctx.fillStyle = `rgba(${SMOKE}, ${p.alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(prev.x, prev.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawLines(now, true);
    ctx.globalCompositeOperation = 'source-over';
  }

  canvas.classList.add('is-on');
  resize();
  const onResize = () => { resize(); if (reducedMotion) drawStatic(); };
  window.addEventListener('resize', onResize);
  if (reducedMotion) {
    map.on('render', drawStatic);
    drawStatic();
  } else {
    raf = requestAnimationFrame(frame);
  }

  return {
    setPeriod(next) {
      if (next === period) return;
      fromWeights = weights;
      period = next;
      budget = paths.length ? softBudget(period) : 0;
      blendStart = performance.now();
      if (map.getLayer('flow-glow')) map.setPaintProperty('flow-glow', 'line-width', glowWidth(period));
      if (reducedMotion) drawStatic();
    },
    hide(kinds) {
      hiddenKinds = kinds ?? [];
      if (reducedMotion) drawStatic();
    },
    highlight(kinds) {
      hotKinds = kinds ?? [];
      if (reducedMotion) drawStatic();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      map.off('render', drawStatic);
      if (map.getLayer('flow-glow')) map.removeLayer('flow-glow');
      if (map.getSource('flow-glow')) map.removeSource('flow-glow');
      window.removeEventListener('resize', onResize);
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      canvas.classList.remove('is-on');
    },
  };
}
