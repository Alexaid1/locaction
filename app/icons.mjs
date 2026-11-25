// Линейные иконки 24×24 в стиле демо. icon(name) - строка SVG, svgIcon(name) - элемент.

const P = {
  // категории
  coffee: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3c-.8 1 .8 2 0 3M12 3c-.8 1 .8 2 0 3"/>',
  cafe: '<path d="M3 11h14v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6z"/><path d="M17 12h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M2 21h18"/><path d="M7 7c0-2 3-2 3-4"/>',
  restaurant: '<path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7a2 2 0 0 1-2 2M8 3v5"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
  bar: '<path d="M5 4h14l-7 8z"/><path d="M12 12v8M8 20h8"/><path d="M15 7.5 17 4"/>',
  hookah: '<path d="M12 3v6M10 3h4"/><path d="M8 13a4 4 0 0 1 8 0c0 3-2 4-2 4h-4s-2-1-2-4z"/><path d="M9 21h6M16 14c2 0 4 1 4 4"/>',
  burger: '<path d="M4 11a8 6 0 0 1 16 0z"/><path d="M3 14h18M4 17h16a0 0 0 0 1 0 0 3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/>',
  canteen: '<path d="M3 14a9 9 0 0 1 18 0z"/><path d="M2 17h20M12 5V3"/>',
  bread: '<path d="M5 20V11a4 4 0 0 1-1-7 4 4 0 0 1 4 0h8a4 4 0 0 1 4 0 4 4 0 0 1-1 7v9z"/><path d="M9 13v3M15 13v3"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2L20 8H6.3"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  basket: '<path d="M4 10h16l-1.5 9h-13z"/><path d="m8 10 3-6M16 10l-3-6M9 14v2M15 14v2"/>',
  cheese: '<path d="M3 17V11l13-6 5 6v6z"/><path d="M3 11h18"/><circle cx="8" cy="14.5" r="1"/><circle cx="15" cy="14" r="1.3"/>',
  wine: '<path d="M8 3h8v4a4 4 0 0 1-8 0z"/><path d="M12 11v9M8.5 20h7"/>',
  pill: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="m9.5 8.5 5 7"/>',
  scissors: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 18M8 15.5 20 6"/>',
  razor: '<path d="M4 15 15 4l5 5L9 20z"/><path d="m4 15 5 5M8 11l5 5"/>',
  nail: '<path d="M9 21V9a3 3 0 0 1 6 0v12"/><path d="M9 11h6"/><path d="M12 3v2"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>',
  shirt: '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a3 3 0 0 1-8 0z"/>',
  ring: '<circle cx="12" cy="15" r="6"/><path d="m9 6 3-3 3 3-3 3z"/>',
  lipstick: '<path d="M9 21V12h6v9z"/><path d="M10 12V7l4-3v8"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  smoke: '<path d="M3 16h14v3H3zM19 16v3"/><path d="M17 12c0-2 2-2 2-4s-2-2-2-4"/>',
  paw: '<circle cx="6" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M8 17a4 4 0 0 1 8 0c0 2-2 3-4 2-2 1-4 0-4-2z"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  bank: '<path d="M3 10 12 4l9 6z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  iron: '<path d="M3 17h17v-3a6 6 0 0 0-6-6H8"/><path d="M6 13h14"/>',
  box: '<path d="m3 7 9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  service: '<path d="M14.5 5.5a3.5 3.5 0 0 0 4.8 4.8L13 16.6 7.4 22 2 16.6 7.4 11l6.3-6.3z"/>',
  food: '<path d="M4 13h16a8 8 0 0 1-16 0z"/><path d="M8 9c0-2 2-2 2-4M13 9c0-2 2-2 2-4"/>',
  // объекты влияния
  metro: '<path d="M4 18 8 6l4 7 4-7 4 12"/><path d="M2 18h5M17 18h5"/>',
  stop: '<rect x="5" y="3" width="14" height="13" rx="2"/><path d="M5 10h14M8 16v3M16 16v3"/><circle cx="8.5" cy="13" r=".6"/><circle cx="15.5" cy="13" r=".6"/>',
  competitor: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19a5 5 0 0 1 10 0M11 19a5 5 0 0 1 10 0"/>',
  anchor: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><path d="m9.5 10 1.8 1.8L15 8"/>',
  office: '<rect x="4" y="3" width="11" height="18"/><path d="M15 9h5v12h-5M7.5 7h4M7.5 11h4M7.5 15h4"/>',
  university: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6"/>',
  residents: '<path d="M3 21V10l9-6 9 6v11z"/><path d="M9 21v-6h6v6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  building: '<rect x="5" y="3" width="14" height="18"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  flow: '<path d="M3 8c4 0 4 3 8 3s4-3 8-3"/><path d="M3 14c4 0 4 3 8 3s4-3 8-3"/><path d="m17 6 2 2-2 2M17 12l2 2-2 2"/>',
  // интерфейс
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  collapse: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5.5 5.5 0 0 1 3.5 6"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18M6 6l9-3 2 3"/>',
  morning: '<path d="M4 18h16M7 18a5 5 0 0 1 10 0"/><path d="M12 6v3M5.6 10.6l2 2M18.4 10.6l-2 2"/>',
  day: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  evening: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>',
  ai: '<path d="M9 3l1.6 4.4L15 9l-4.4 1.6L9 15l-1.6-4.4L3 9l4.4-1.6z"/><path d="M17 13l.9 2.1L20 16l-2.1.9L17 19l-.9-2.1L14 16l2.1-.9z"/>',
  compare: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  warning: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  text: '<path d="M4 6h16M4 11h16M4 16h10"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  area: '<rect x="4" y="4" width="16" height="16"/><path d="M4 9h3M4 14h3M9 4v3M14 4v3"/>',
  chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 12h16"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  student: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  tourist: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  family: '<circle cx="8" cy="6" r="2.5"/><circle cx="16.5" cy="9" r="2"/><path d="M4 21v-6a4 4 0 0 1 8 0v6M13.5 21v-4a3 3 0 0 1 6 0v4"/>',
};

export function icon(name, size = 22) {
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] ?? P.building}</svg>`;
}

export function svgIcon(name, size) {
  const holder = document.createElement('span');
  holder.className = 'ic-wrap';
  holder.innerHTML = icon(name, size);
  return holder;
}

export const ICONS = Object.keys(P);
