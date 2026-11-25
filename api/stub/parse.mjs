// Заглушка POST /v1/parse: разбор свободного текста правилами вместо LLM.
// Из нескольких совпадений берётся то, что раньше встречается в тексте.

const W = '[а-яё]';
const word = (stem, tail = W + '*') => new RegExp(`(?<!${W})${stem}${tail}`, 'u');

const CATEGORY_RULES = [
  ['services.barbershop', /барбер/u],
  ['services.pickup', /пвз|пункт\S* выдачи|озон|ozon|wildberries|вайлдберриз|маркетплейс/u],
  ['retail.pharmacy', /аптек/u],
  ['food.bakery', /пекарн|кондитерск|выпечк/u],
  ['food.coffee', /кофейн|кофе(?!маш)|coffee|бариста/u],
  ['food.hookah', /кальянн(?:ая|ую|ой)(?! магазин)/u],
  ['food.bar', word('бар', '(?:ы|а|ом)?(?![а-яё])')],
  ['food.bar', /пивн(?:ой|ая|ую) бар|паб(?![а-яё])|рюмочн|винотек/u],
  ['food.fast_food', /фастфуд|фаст-фуд|шаурм|шаверм|бургер|хот-?дог|пицц|суши|роллы|стрит-?фуд/u],
  ['food.canteen', /столов(?:ая|ую|ой)/u],
  ['food.restaurant', /ресторан/u],
  ['food.cafe', word('кафе', '(?![а-яё])'), ],
  ['food.cafe', /кафешк|бистро/u],
  ['retail.supermarket', /супермаркет|гипермаркет/u],
  ['retail.grocery', /продуктов|продукты|минимаркет|магазин у дома/u],
  ['retail.specialty_food', /мясн|сырн|рыбн|фермер|овощ|фрукт|чайн|деликатес/u],
  ['retail.alcohol', /алкогол|винн(?:ый|ая) магазин|разливн|пивн(?:ой|ая) магазин/u],
  ['retail.clothing', /одежд|обув|бутик|шоурум/u],
  ['retail.jewelry', /ювелир|украшени|бижутер/u],
  ['retail.cosmetics', /косметик|парфюм/u],
  ['retail.electronics', /электроник|телефон|гаджет|смартфон|ноутбук/u],
  ['retail.tobacco', /табак|вейп|сигарет/u],
  ['retail.pets', /зоомагазин|зоотовар|для животных|для собак|для кошек/u],
  ['services.beauty', /салон красоты|парикмахер|стрижк|бьюти|beauty/u],
  ['services.nails', /маникюр|ногт|педикюр|nail/u],
  ['services.cosmetology', /косметолог|депиляц|эпиляц/u],
  ['services.bank', word('банк'), ],
  ['services.bank', /обмен валют|обменник/u],
  ['services.household', /химчист|прачечн|ателье|ремонт обуви|ремонт одежды|ремонт телефон|мастерская|изготовлен\S* ключ/u],
  ['retail.other', /цветоч|цветы|книжн|канцтовар|подарк|сувенир|хозтовар|магазин/u],
  ['services.other', /услуг|копицентр|фотосалон|турагент/u],
];

const FORMAT_RULES = [
  ['takeaway', /навынос|на вынос|с собой|to go|окошк/u],
  ['seating', /посадк|посадочн|столик|зал(?![а-яё])|сидячи/u],
  ['kiosk', /киоск|островок|корнер|павильон/u],
  ['pickup', /пвз|пункт\S* выдачи/u],
  ['service_room', /кабинет|студи[яюи]|салон|мастерская/u],
  ['store', /магазин|лавк|бутик|супермаркет|минимаркет/u],
];

const AUDIENCE_RULES = [
  ['commuters', /метро|пассажир|по дороге|на работу|электрич|станци|мцк|мцд/u],
  ['residents', /жител|жильц|двор|у дома|возле дома|спальн|жилой комплекс|жк(?![а-яё])/u],
  ['office_workers', /офис|бизнес-?центр|бц(?![а-яё])|работающ|сотрудник/u],
  ['students', /студент|универ|вуз|институт|колледж|школьник/u],
  ['tourists', /турист|гост(?:и|ей) города|приезж/u],
  ['families', /(?<![а-яё])мам|(?<![а-яё])дет[еис]|семь|семей|коляск|родител/u],
  ['drivers', /водител|автомобил|машин|парковк|трасс/u],
];

const FIELDS = ['category_id', 'format', 'avg_check_rub', 'hours', 'audience', 'area_m2', 'ownership'];

function earliest(text, rules) {
  let best = null;
  for (const [value, pattern] of rules) {
    const match = pattern.exec(text);
    if (match && (!best || match.index < best.index)) best = { value, index: match.index };
  }
  return best?.value ?? null;
}

const pad = (h, m = '00') => `${String(h).padStart(2, '0')}:${m ?? '00'}`;

function hours(text) {
  let open, close;
  const words = text.match(/с\s*(\d{1,2})(?::(\d{2}))?\s*(?:ч\S*\s*)?до\s*(\d{1,2})(?::(\d{2}))?/u);
  const clock = text.match(/(?<!\d)(\d{1,2}):(\d{2})\s*[-\u2013\u2014]\s*(\d{1,2}):(\d{2})/u);
  if (/круглосуточн|24\/7/u.test(text)) [open, close] = ['00:00', '24:00'];
  else if (words) [open, close] = [pad(words[1], words[2]), pad(words[3], words[4])];
  else if (clock) [open, close] = [pad(clock[1], clock[2]), pad(clock[3], clock[4])];
  if (!open || open > '23:59' || close > '24:00') return null;
  let days = 'daily';
  if (/без выходных|ежедневн|каждый день|7 дней|все дни/u.test(text)) days = 'daily';
  else if (/будн|пн\s*-\s*пт/u.test(text)) days = 'weekdays';
  else if (/(?<![а-яё])(?:по|в|на) выходн/u.test(text)) days = 'weekends';
  return { open, close, days };
}

function check(text) {
  const near = text.match(/чек\D{0,15}?(\d[\d\s]{0,8}\d|\d)/u) ?? text.match(/(\d[\d\s]{0,8}\d|\d)\s*(?:₽|руб|р\.)/u);
  const value = near ? Number(near[1].replace(/\s/g, '')) : null;
  return value && value <= 1_000_000 ? value : null;
}

function area(text) {
  const match = text.match(/(\d{1,5}(?:[.,]\d+)?)\s*(?:м²|м2|кв\.?\s*м|квадрат)/u);
  const value = match ? Number(match[1].replace(',', '.')) : null;
  return value && value >= 1 && value <= 10000 ? value : null;
}

function ownership(text) {
  if (/франшиз/u.test(text)) return 'franchise';
  if (/(?<![а-яё])сет(?:ь|и|евой|евая|евую)(?![а-яё])|филиал/u.test(text)) return 'chain';
  if (/(?<![а-яё])сво(?:я|й|ю|ё|е|его)(?![а-яё])|независим|собственн/u.test(text)) return 'independent';
  return null;
}

export function missingOf(params) {
  return FIELDS.filter((key) => params[key] === null || (Array.isArray(params[key]) && params[key].length === 0));
}

export async function parse(input) {
  const raw = String(input ?? '').trim().slice(0, 2000);
  const text = raw.toLowerCase().replaceAll('ё', 'е');
  const params = {
    schema: 'locaction.params/1',
    category_id: earliest(text, CATEGORY_RULES),
    format: earliest(text, FORMAT_RULES),
    avg_check_rub: check(text),
    hours: hours(text),
    audience: AUDIENCE_RULES.filter(([, pattern]) => pattern.test(text)).map(([value]) => value),
    area_m2: area(text),
    ownership: ownership(text),
    source: 'text',
    raw_text: raw,
  };
  params.missing = missingOf(params);
  return { params };
}
