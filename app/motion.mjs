// Учёт системной настройки «уменьшить движение».
const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => Boolean(query?.matches);

// FLIP: плавно перевести элемент из старого прямоугольника в новый после смены раскладки.
export async function morph(element, change, { duration = 520, radius } = {}) {
  const first = element.getBoundingClientRect();
  await change();
  const last = element.getBoundingClientRect();
  if (reducedMotion() || !first.width || !last.width) return;
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = first.width / last.width;
  const sy = first.height / last.height;
  const frames = [
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: radius?.[0] },
    { transform: 'none', borderRadius: radius?.[1] },
  ];
  if (!radius) frames.forEach((f) => delete f.borderRadius);
  await element.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.catch(() => {});
}
