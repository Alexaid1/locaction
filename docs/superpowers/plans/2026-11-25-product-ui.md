# Интерфейс продукта LOCACTION - план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение на карте Москвы: любая точка или адрес → анкета или свободный текст → карточка по контракту `locaction.card/1` с 3D-видом влияния и «дымом» потоков, на заглушке API, которая переключается на сервер одной строкой.

**Architecture:** Статический сайт без сборщика, ES-модули. Слой `api/` - единственная граница с сервером: `api/client.mjs` отдаёт три функции (`parse`, `card`, `explain`), за ними либо `fetch` к `API_BASE`, либо `api/stub/` (Overpass + демо-индекс v2 + правила). Слой `app/` - экраны и карта на MapLibre (уже в `map/vendor`), свой холст частиц поверх карты.

**Tech Stack:** MapLibre GL и PMTiles из `map/vendor`, ванильный JS (ES2022), `node --test` для чистых модулей, Python + `jsonschema` для проверки контракта, Python + `pmtiles` + `mapbox-vector-tile` (только для сборки индекса адресов).

**Spec:** [docs/superpowers/specs/2026-11-25-product-ui-design.md](../specs/2026-11-25-product-ui-design.md), контракт [contract/README.md](../../../contract/README.md).

## Global Constraints

- Дефис «-» вместо тире во всех текстах интерфейса, комментариях и документах.
- Без новых библиотек в браузере; всё, что грузится страницей, лежит в репозитории.
- Без ключей и сервера: работает на GitHub Pages как статика; путь сайта `/locaction/`.
- Карточка строго по `contract/card.schema.json`; заглушка проходит `python tools/check_contract.py`.
- `forecast.probability` только при `status = validated`; `map.points` только `source: osm | mos_data`.
- Подпись потоков (`flows.label`) видна всегда, когда видны потоки или их числа.
- `explain.price_rub = null`: цену не показываем.
- Анимации 0,3-0,8 с; при `prefers-reduced-motion: reduce` - без облёта камеры, частицы заменяются статичными линиями.
- Без WebGL - картинка `mitino.webp`, поиск адреса и карточка без 3D работают.
- Не публиковать (`git push`) и не тратить деньги на LLM без явного согласия владельца. Коммиты локальные, ветка `main`.
- Цвета и шрифты - из `styles.css` демо (`--paper #f7f3e8`, `--green #214c3c`, `--display` Georgia).

## Review Focus

1. Overpass медленный, отдаёт 429 или падает - через 12 с карточка всё равно открывается на примерных данных с плашкой, без бесконечной загрузки (тест в Task 3).
2. Адрес с «ё», «ул.», «д.», «корп. 2», «к2», в другом порядке слов или не найден - находится или пишется «Не нашли адрес, кликните по карте» (тест в Task 1).
3. Точка вне Москвы или клик мимо здания - вне границ ошибка `out_of_area` с понятным текстом; мимо здания - «Точка на карте» и ближайшая улица (тест в Task 3 и Task 4).
4. Испорченный или старый `#` в адресе (не JSON, неизвестная категория) - приложение открывает главную без ошибки (тест в Task 4).
5. Свободный текст без узнаваемого типа бизнеса - `category_id: null`, анкета просит выбрать плитку, «Рассчитать» не пускает без категории (тест в Task 2 и Task 5).

---

## Файлы

| Файл | Отвечает за |
|---|---|
| `config.mjs` | `API_BASE` - единственная строка для переключения |
| `api/client.mjs` | `parse`, `card`, `explain`; выбор stub или fetch; ошибки `ApiError` |
| `api/numbers.mjs` | проверка «в тексте нет чисел не из карточки» (порт `tools/check_contract.py`) |
| `api/stub/index.mjs` | заглушка трёх запросов |
| `api/stub/parse.mjs` | разбор текста правилами |
| `api/stub/osm-categories.mjs` | категория → теги OSM конкурентов, иконки, подписи |
| `api/stub/overpass.mjs` | запрос объектов в 800 м, таймаут, зеркало |
| `api/stub/demo-index.mjs` | демо-индекс v2 по категории → `place`, `map.points` |
| `api/stub/flows.mjs` | отрезки улиц с интенсивностью утро/день/вечер |
| `api/stub/sample.mjs` | примерные данные (сбой Overpass, `?forecast=validated`) |
| `api/stub/explain.mjs` | разбор шаблоном из чисел карточки |
| `app/main.mjs` | экраны и переходы, связка всего |
| `app/state.mjs` | состояние ↔ `#s=...` |
| `app/search.mjs` | индекс адресов: нормализация, поиск, загрузка частей |
| `app/map-view.mjs` | карта: создание, раскрытие, выбор здания, режимы 2D/3D |
| `app/scene.mjs` | 3D-сцена результата: объём, кольцо, метки, облёт |
| `app/smoke.mjs` | холст частиц и линий влияния |
| `app/building-popup.mjs`, `app/questionnaire.mjs`, `app/result-panel.mjs`, `app/compare.mjs` | экраны |
| `app/icons.mjs` | SVG-иконки строками |
| `app/format.mjs` | числа и подписи по-русски |
| `app/app.css` | стили приложения |
| `index.html` | новое приложение; `example.html` - прежний отчёт по Митино |
| `map/metro.json`, `map/addresses/*.json` | станции метро, индекс адресов (ODbL, из OSM) |
| `tools/build_lookup.py` | сборка `map/metro.json` и `map/addresses/` |
| `tests/*.test.mjs`, `tests/fixtures/` | тесты `node --test` |

---

### Task 1: Станции метро, индекс адресов и поиск

**Files:**
- Create: `tools/build_lookup.py`, `map/metro.json`, `map/addresses/index.json`, `map/addresses/<буква>.json`, `app/search.mjs`, `tests/search.test.mjs`
- Modify: `.gitignore` (добавить `/.venv-tools/`), `map/SOURCES.md` (две строки о новых файлах)

**Interfaces:**
- Produces: `normalize(text: string): string[]` (токены); `shardKey(text: string): string | null`; `rank(query: string, rows: Row[], limit = 6): Row[]`; `createSearch(baseUrl: URL): { suggest(query: string): Promise<Row[]> }`; `nearestMetro(lon, lat, stations): { name, distance_m, lon, lat }`. `Row = { a: string, x: number, y: number, o: string }` (адрес, долгота, широта, `way/…`). `map/metro.json` = `[{ "name", "lon", "lat" }]`.

- [ ] **Step 1: Собрать данные.** `python -m venv .venv-tools` и `pip install pmtiles mapbox-vector-tile`. `tools/build_lookup.py`: читает все тайлы z14 `map/buildings.pmtiles`, берёт объекты с `address`, точку - центр описывающего прямоугольника контура в градусах (6 знаков), дубликаты одного `osm` - один раз; раскладывает строки по первой букве `shardKey(address)` в `map/addresses/<буква>.json` (массив `Row`, сортировка по `a`), пишет `index.json` = `{ "keys": [...], "count": N, "osm_snapshot": ... }`. Метро - из `D:/Urban/commercial-history/data/reference/metro_stations.csv`, `opened <= 2026-11-25`, одна точка на пару (имя, координаты до 4 знаков). Нормализация в Python повторяет `normalize` из JS (те же списки слов).
- [ ] **Step 2: Проверка сборки.** Run: `.venv-tools/Scripts/python tools/build_lookup.py`. Expected: печатает число адресов (ожидаем десятки тысяч и больше) и станций (около 250-300), ни одна часть не больше 1,5 МБ; `Дубравная улица, 36` есть в части `д`.
- [ ] **Step 3: Тесты поиска.**

```js
test('normalize drops street types and folds ё', () => {
  assert.deepEqual(normalize('ул. Дубравная, д. 36, корп. 2'), ['дубравная', '36', 'к2']);
  assert.deepEqual(normalize('Дубравная улица 36к2'), ['дубравная', '36', 'к2']);
  assert.deepEqual(normalize('Шоссе Энтузиастов'), ['энтузиастов']);
  assert.equal(normalize('Тёплый Стан')[0], 'теплый');
});
test('shardKey is first letter of first word token', () => {
  assert.equal(shardKey('36 Дубравная'), 'д');
  assert.equal(shardKey('  '), null);
});
test('rank prefers exact house, any word order', () => {
  const rows = [{ a: 'Дубравная улица, 36', x: 1, y: 1, o: 'way/1' }, { a: 'Дубравная улица, 36к2', x: 1, y: 1, o: 'way/2' },
                { a: 'Дубравная улица, 38', x: 1, y: 1, o: 'way/3' }];
  assert.equal(rank('36 дубравная', rows)[0].o, 'way/1');
  assert.equal(rank('Дубравная 36 к2', rows)[0].o, 'way/2');
  assert.deepEqual(rank('Профсоюзная', rows), []);
});
test('nearestMetro returns rounded distance', () => {
  const st = [{ name: 'Митино', lon: 37.3618, lat: 55.8459 }];
  assert.equal(nearestMetro(37.3618, 55.8450, st).distance_m, 100);
});
```
- [ ] **Step 4: Run** `node --test tests/search.test.mjs` - FAIL (нет модуля).
- [ ] **Step 5: Реализовать `app/search.mjs`.** Слова-типы: улица ул проспект пр пр-т переулок пер шоссе ш бульвар б-р площадь пл проезд пр-д набережная наб тупик аллея линия квартал дом д строение стр корпус корп владение вл. `корп. 2`/`к 2`/`36к2` → `36`, `к2`; `стр 1` → `с1`. `rank`: все токены запроса должны быть префиксами токенов адреса; выше - точное совпадение номера дома, затем короче адрес. `createSearch` кэширует загруженные части. `nearestMetro` - гаверсинус, округление до 10 м.
- [ ] **Step 6: Run** `node --test tests/search.test.mjs` - PASS.
- [ ] **Step 7: Commit** `feat: address index, metro stations and search`.

### Task 2: Слой API, разбор текста, разбор от ИИ

**Files:**
- Create: `config.mjs`, `api/client.mjs`, `api/numbers.mjs`, `api/stub/index.mjs` (пока `parse`, `explain`), `api/stub/parse.mjs`, `api/stub/explain.mjs`, `api/stub/osm-categories.mjs` (подписи, группы, иконки; теги - в Task 3), `tests/parse.test.mjs`, `tests/numbers.test.mjs`, `tests/contract.mjs` (помощник)

**Interfaces:**
- Produces: `config.mjs`: `export const API_BASE = 'stub'`. `api/client.mjs`: `parse(text: string): Promise<{ params }>`, `card(request: { point: {lat, lon}, building: {osm, unom} | null, params }, hints?: { roads?: Feature[] }): Promise<Card>`, `explain(card: Card): Promise<Explain>`, `class ApiError extends Error { code }`. Для настоящего API: `POST ${API_BASE}/v1/parse|card|explain`, `explain` шлёт `{ card_id }`, `hints` не отправляются; ответ `explain` с непустым `unknownNumbers` → `ApiError('llm_failed')`. `api/numbers.mjs`: `cardNumbers(card): Set<string>`, `unknownNumbers(explain, card): string[]` - та же логика, что в `tools/check_contract.py`. `osm-categories.mjs`: `CATEGORIES: Array<{ id, label, group: 'food'|'retail'|'services', icon }>` в порядке `contract/categories.json`. `tests/contract.mjs`: `assertValid(kind, data)` - пишет JSON во временный файл и вызывает `python tools/check_contract.py kind file`, падает с выводом при ошибке.

- [ ] **Step 1: Тесты.**

```js
test('parse finds coffee takeaway with check, hours, audience', async () => {
  const { params } = await stubParse('Кофейня навынос, чек около 350 ₽, с 7 до 21 без выходных, люди у метро и мамы с колясками');
  assert.equal(params.category_id, 'food.coffee');
  assert.equal(params.format, 'takeaway');
  assert.equal(params.avg_check_rub, 350);
  assert.deepEqual(params.hours, { open: '07:00', close: '21:00', days: 'daily' });
  assert.deepEqual(params.audience.sort(), ['commuters', 'families']);
  assert.deepEqual(params.missing.sort(), ['area_m2', 'ownership']);
  assertValid('parse', { params });
});
test('parse without business type gives null category', async () => {
  const { params } = await stubParse('Хочу что-нибудь открыть возле дома');
  assert.equal(params.category_id, null);
  assert.ok(params.missing.includes('category_id'));
});
test('parse maps pickup, pharmacy, barbershop', async () => {
  for (const [text, id] of [['ПВЗ Озона', 'services.pickup'], ['аптека у дома', 'retail.pharmacy'], ['барбершоп', 'services.barbershop']])
    assert.equal((await stubParse(text)).params.category_id, id);
});
test('unknownNumbers catches invented numbers and accepts percent of probability', () => {
  const card = JSON.parse(readFileSync('contract/examples/card-validated.json'));
  const ex = JSON.parse(readFileSync('contract/examples/explain-response.json'));
  assert.deepEqual(unknownNumbers(ex, card), []);
  ex.checks[0].text += ' Аренда 15 000 ₽, шанс 84%.';
  assert.deepEqual(unknownNumbers(ex, card), ['15000']);
});
test('stub explain uses only card numbers', async () => {
  const card = JSON.parse(readFileSync('contract/examples/card-not-validated.json'));
  const ex = await stubExplain(card);
  assertValid('explain', ex);
  assert.deepEqual(unknownNumbers(ex, card), []);
  assert.ok(ex.strengths.length >= 1 && ex.checks.length >= 1);
});
```
- [ ] **Step 2: Run** `node --test tests/parse.test.mjs tests/numbers.test.mjs` - FAIL.
- [ ] **Step 3: Реализовать.** `parse.mjs` - словарь корней → категория (порядок важен: «барбер» раньше «парикмахер», «кофейн» раньше «кафе»), формат (навынос/с собой, посадка/зал/столик, киоск/островок, магазин, кабинет, пункт выдачи), чек (`(\d[\d ]*)\s*(₽|руб|р\b)` или «чек … N»), часы (`с N до M`, `N-M`, «круглосуточно» → 00:00-24:00), дни (без выходных/ежедневно/каждый день → daily, по будням → weekdays, выходные → weekends), аудитория (метро/пассажир/по дороге → commuters, жител/жильц/двор/у дома → residents, офис → office_workers, студент → students, турист → tourists, мам/дет/семь/коляск → families, водител/машин/парковк → drivers), площадь (`N м²|м2|кв`), своя/сеть/франшиза. `explain.mjs`: сильное - показатели `effect: plus` по убыванию `weight` (до 3), слабое - `minus` (до 3), проверить - из `field_checks` и показателей; в тексте только числа из карточки, проценты - `percentile_city`. `client.mjs` берёт `API_BASE` из `config.mjs`; заглушка грузится динамическим `import()` только при `stub`.
- [ ] **Step 4: Run** `node --test tests/` - PASS.
- [ ] **Step 5: Commit** `feat: api client, stub text parsing and explanation`.

### Task 3: Заглушка карточки (Overpass, демо-индекс v2, потоки)

**Files:**
- Create: `api/stub/overpass.mjs`, `api/stub/demo-index.mjs`, `api/stub/flows.mjs`, `api/stub/sample.mjs`, `tests/fixtures/overpass-dubravnaya.json`, `tests/fixtures/roads-dubravnaya.json`, `tests/card.test.mjs`
- Modify: `api/stub/index.mjs` (добавить `card`), `api/stub/osm-categories.mjs` (теги конкурентов на все 28 категорий)

**Interfaces:**
- Consumes: `nearestMetro` (Task 1), `CATEGORIES` (Task 2), `factors` из `methodology.mjs` (правила v2 без изменений).
- Produces: `fetchOsm(lat, lon, categoryId, { timeoutMs = 12000, fetchImpl = fetch }): Promise<OsmObject[]>` (`{ id: 'osm:node/1', tags, lat, lon }`; при сбое бросает); `scorePlace(objects, point, categoryId, metro): { place, points, metroDist }`; `buildFlows(roads: Feature[], point, points): FeatureCollection`; `localIntensity(segments, point, radius = 120): { morning, day, evening }` (0..1, используется панелью); `sampleCard(request, { validated })`; `stubCard(request, hints, { fetchImpl = fetch, timeoutMs = 12000, now = () => new Date() } = {})`. Overpass: `https://overpass-api.de/api/interpreter`, затем `https://maps.mail.ru/osm/tools/overpass/api/interpreter`, общий таймаут 12 с, `[out:json][timeout:10]`, `nwr(around:800,lat,lon)`, `out center tags`.

- [ ] **Step 1: Фикстуры.** `overpass-dubravnaya.json` - сокращённый ответ Overpass вокруг 55.84528, 37.36114: 6 `amenity=cafe` (2 в 300 м), 1 `railway=subway_entrance` в ~260 м, 4 `highway=bus_stop` в 300 м, 3 `office=*` в 500 м, `shop=supermarket` и `leisure=fitness_centre` в 300 м, 1 узел без координат (должен отброситься). `roads-dubravnaya.json` - 5 линий `kind` street/path/arterial, одна целиком дальше 800 м.
- [ ] **Step 2: Тесты.**

```js
test('stub card from fixture is valid and uses demo index v2', async () => {
  const card = await stubCard(req('food.coffee'), { roads }, { fetchImpl: fixtureFetch(overpass), now: fixedNow });
  assertValid('card', card);
  assert.equal(card.engine.kind, 'demo_index_v2');
  assert.equal(card.forecast.status, 'not_validated');
  assert.equal(card.forecast.probability, null);
  assert.equal(card.flows.status, 'illustration');
  assert.equal(card.explain.price_rub, null);
  assert.ok(card.map.points.every((p) => p.source === 'osm'));
  const ids = card.place.indicators.map((i) => i.id);
  assert.deepEqual(ids, ['metro_dist_m', 'competitors_300', 'stops_300', 'offices_500', 'attractors_300']);
});
test('demo index matches methodology for known counts', () => {
  const { place } = scorePlace(objects, point, 'food.coffee', metro);
  // 2 кафе в 300 м, метро 260 м, 4 остановки, 3 офиса, 2 якоря
  const expected = 25 * 0.8 + 35 * (440 / 625) + 15 * (4 / 6) + 10 * (3 / 20) + 15 * (2 / 12);
  assert.equal(place.score.value, Math.round(expected * 10) / 10);
});
test('competitors follow category: pharmacy ignores cafes', () => {
  const { place } = scorePlace(objects, point, 'retail.pharmacy', metro);
  assert.equal(place.indicators.find((i) => i.id === 'competitors_300').value, 0);
});
test('every category has competitor tags', () => {
  assert.equal(CATEGORIES.length, 28);
  for (const c of CATEGORIES) assert.ok(c.osm?.length, c.id);
});
test('flows stay inside radius and are normalised', () => {
  const fc = buildFlows(roads, point, points);
  assert.ok(fc.features.length > 0 && fc.features.length <= 2000);
  const all = fc.features.flatMap((f) => [f.properties.morning, f.properties.day, f.properties.evening]);
  assert.equal(Math.max(...all), 1);
  assert.ok(fc.features.every((f) => f.geometry.coordinates.every(([x, y]) => haversine(x, y, point.lon, point.lat) <= 820)));
});
test('overpass failure falls back to sample card within timeout', async () => {
  const hang = () => new Promise(() => {});
  const t0 = Date.now();
  const card = await stubCard(req('food.coffee'), { roads }, { fetchImpl: hang, timeoutMs: 50, now: fixedNow });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(card.engine.kind, 'stub');
  assertValid('card', card);
});
test('point outside Moscow is out_of_area', async () => {
  await assert.rejects(stubCard({ ...req('food.coffee'), point: { lat: 59.93, lon: 30.31 } }, {}, {}), { code: 'out_of_area' });
});
test('validated preview has probability inside interval', () => {
  const card = sampleCard(req('food.coffee'), { validated: true });
  assertValid('card', card);
  assert.equal(card.forecast.status, 'validated');
});
```
- [ ] **Step 3: Run** `node --test tests/card.test.mjs` - FAIL.
- [ ] **Step 4: Реализовать.**
  - Теги конкурентов (`osm`: массив `[key, values[]]`): coffee/cafe `amenity=cafe`; restaurant `amenity=restaurant`; bar `amenity=bar|pub`; hookah `amenity=hookah_lounge`; fast_food `amenity=fast_food`; canteen `amenity=canteen|food_court`; bakery `shop=bakery|pastry|confectionery`; supermarket `shop=supermarket`; grocery `shop=convenience|grocery`; specialty_food `shop=butcher|cheese|deli|greengrocer|seafood|tea|coffee`; alcohol `shop=alcohol|wine|beverages`; pharmacy `amenity=pharmacy`; clothing `shop=clothes|shoes`; jewelry `shop=jewelry|watches`; cosmetics `shop=cosmetics|perfumery`; electronics `shop=electronics|mobile_phone|computer`; tobacco `shop=tobacco|e-cigarette`; pets `shop=pet`; retail.other `shop=gift|books|stationery|florist|variety_store|hardware`; beauty/barbershop `shop=hairdresser`; nails/cosmetology `shop=beauty`; bank `amenity=bank|bureau_de_change`; household `shop=dry_cleaning|laundry|tailor|shoe_repair`; pickup `shop=outpost`; services.other `shop=copyshop|photo|travel_agency`.
  - Остальные объекты запроса: `railway=subway_entrance`, `highway=bus_stop`, `public_transport=platform`, `office`, `shop=supermarket|mall`, `leisure=fitness_centre|sports_centre`, `amenity=clinic|hospital|doctors|university|college`.
  - Индекс - пять факторов `methodology.mjs` с теми же весами и правилами; конкуренты - своей категории в 300 м; метро - ближайший вход из ответа, иначе станция из `map/metro.json`; якоря: супермаркет, ТЦ, фитнес, клиники в 300 м. `effect`: `plus` при балле фактора ≥ 0,6, `minus` при ≤ 0,3, иначе `neutral`; `weight` = вес/100; `percentile_city: null`; `score.value` до десятых.
  - `map.points`: конкуренты в 800 м (`minus`), входы метро, остановки 300 м, якоря 800 м, офисы 500 м, вузы 800 м (`plus`); `strength = 1 - d/800`, не больше 150, по убыванию силы.
  - Потоки: отрезать линии кругом 800 м, резать на куски до 60 м; база по `kind`: path 0,8, street 0,7, arterial 0,6, major 0,5, access 0,4; `m = exp(-dМетро/300)`, `a = max exp(-dЯкорь/200)`, `p = exp(-dТочка/400)`; утро `b·(0,4+0,6m)·(0,5+0,5p)`, день `b·(0,3+0,4a+0,3p)`, вечер `b·(0,4+0,4m+0,2a)`; делить на общий максимум; координаты 6 знаков.
  - `sample.mjs`: детерминированные числа от координат (сид - округлённые lat/lon), те же блоки, `engine.kind = 'stub'`; `validated: true` даёт `forecast` как в `contract/examples/card-validated.json` и плашку в `limits`: «Пример состояния, числа не настоящие».
  - Границы Москвы: lat 55.1-56.1, lon 36.8-38.0 (как в схеме); вне - `ApiError('out_of_area', 'Пока считаем только Москву')`.
  - `card_id` = `c_` + дата + 6 hex от координат и категории.
- [ ] **Step 5: Run** `node --test tests/` - PASS.
- [ ] **Step 6: Живая проверка.** Run: `node -e "import('./api/stub/index.mjs').then(async m => console.log(JSON.stringify((await m.card({point:{lat:55.84528,lon:37.36114},building:null,params:{schema:'locaction.params/1',category_id:'food.coffee',source:'form',missing:[]}},{})).place.score)))"` - печатает оценку с `method: demo_index_v2` (или `engine stub`, если Overpass недоступен - тогда записать это в журнал).
- [ ] **Step 7: Commit** `feat: stub card on Overpass with demo index v2 and flow illustration`.

### Task 4: Оболочка приложения, карта на весь экран, поиск и выбор здания

**Files:**
- Create: `index.html` (новый), `example.html` (прежний `index.html` без изменений содержимого), `app/main.mjs`, `app/state.mjs`, `app/map-view.mjs`, `app/building-popup.mjs`, `app/icons.mjs`, `app/format.mjs`, `app/app.css`, `tests/state.test.mjs`
- Modify: `tools/preview.py` (`PUBLIC_FILES` + `example.html`, `config.mjs`; каталоги `api`, `app`, `contract`, `map`)

**Interfaces:**
- Consumes: `createSearch`, `nearestMetro` (Task 1); `addBuildingStyle` из `map/buildings.mjs`, `loadBasemap` из `map/basemap.mjs`.
- Produces: `state.mjs`: `encode(state): string`, `decode(hash: string): State | null`; `State = { screen: 'home'|'map'|'form'|'result'|'compare', point?: {lat, lon}, building?: {osm, unom, address, kind, footprint} | null, params?: Params }`. `map-view.mjs`: `createMapView(root: HTMLElement): Promise<MapView>`; `MapView = { map, expand(): Promise<void>, collapse(): Promise<void>, flyToPoint(lngLat, opts?): Promise<void>, select(feature | null, lngLat): void, setMode('select'|'form'|'result'), roadsNear(lngLat, radius_m): Feature[], on(event: 'pick', cb: (pick: { lngLat, building }) => void) }`.

- [ ] **Step 1: Тест состояния.**

```js
test('state round-trips through hash', () => {
  const s = { screen: 'result', point: { lat: 55.84528, lon: 37.36114 }, building: null, params: sampleParams };
  assert.deepEqual(decode(encode(s)), s);
});
test('broken or foreign hash gives null', () => {
  for (const h of ['', '#', '#s=%%%', '#s=eyJ4IjoxfQ', '#foo=1']) assert.equal(decode(h), null);
});
test('unknown category is dropped, screen falls back to form', () => {
  const s = decode(encode({ screen: 'result', point: { lat: 55.8, lon: 37.4 }, params: { ...sampleParams, category_id: 'x.y' } }));
  assert.equal(s.screen, 'form');
  assert.equal(s.params.category_id, null);
});
```
`encode` - `#s=` + base64url(JSON), координаты 5 знаков.
- [ ] **Step 2: Run** `node --test tests/state.test.mjs` - FAIL, затем реализовать `state.mjs` - PASS.
- [ ] **Step 3: Главная и раскрытие.** `index.html`: шапка (знак, «LOCACTION»), слева заголовок «Где открыть точку?» одной строкой и строка поиска, справа карта в рамке со скруглением; под поиском ссылка «Пример: 3 адреса в Митино» → `example.html`. Раскрытие - FLIP: запомнить прямоугольник рамки, добавить `body.map-full` (карта `position: fixed; inset: 0`), анимировать `transform` от старого прямоугольника к новому за 500 мс `cubic-bezier(.2,.8,.2,1)`, затем `map.resize()`. Триггеры: кнопка «Развернуть», первый `pointerdown` по карте, выбор подсказки поиска. «Свернуть» и `Esc` - обратно. В полноэкранном режиме `cooperativeGestures` выключены; в рамке - включены.
- [ ] **Step 4: Поиск.** Строка поиска плавает сверху по центру в полноэкранном режиме; подсказки после 2 символов, стрелки и Enter; выбор → `flyToPoint` (зум 17, наклон 40°, 1,2 с), затем выбор здания под точкой. Ничего не нашли - строка «Не нашли адрес, кликните по карте».
- [ ] **Step 5: Выбор здания.** Клик → здание под курсором (`queryRenderedFeatures` по `building-fill`); выбранное здание - слой `fill-extrusion` с высотой из `feature-state.h`, которая растёт 0 → 24 м за 600 мс, цвет `#3b7561`; камера наклоняется до 40°. Клик мимо здания - метка-пин, адрес «Точка на карте» + имя ближайшей улицы из `roads`. Вне границ подложки - тост «Пока считаем только Москву».
- [ ] **Step 6: Мини-карточка здания.** Всплывает у точки (на телефоне - снизу): адрес крупно, три строки «иконка - значение»: тип здания, «≈ N м до м. Имя», площадь контура; кнопки «Подтвердить» (основная) и «×». Появление - подъём 12 px и прозрачность за 300 мс.
- [ ] **Step 7: Без WebGL** - вместо карты `mitino.webp`, поиск работает, выбор подсказки сразу открывает мини-карточку.
- [ ] **Step 8: Проверка в браузере.** `python tools/preview.py --port 8092`, открыть `http://127.0.0.1:8092/locaction/`: раскрытие по кнопке и по касанию, поиск «Дубравная 36» перелетает и выделяет здание, мини-карточка с метро, `Esc` сворачивает, `example.html` открывает прежний отчёт. Скриншоты компьютер и 375 px.
- [ ] **Step 9: Commit** `feat: map-first app shell with fullscreen map, search and building pick`.

### Task 5: Анкета и «Мы поняли так»

**Files:**
- Create: `app/questionnaire.mjs`, `tests/questionnaire.test.mjs`
- Modify: `app/main.mjs`, `app/app.css`, `app/icons.mjs` (иконки 28 категорий и аудиторий)

**Interfaces:**
- Consumes: `parse` (Task 2), `CATEGORIES` (Task 2), `MapView.setMode('form')` (Task 4).
- Produces: `formToParams(form: FormState): Params` и `paramsToForm(params): FormState` (чистые, тестируются); `mountQuestionnaire(el, { initial: Params | null, onSubmit(params) })`. `FormState = { category_id, format, avg_check_rub, open, close, days, audience: Set, area_m2, ownership, source, raw_text }`.

- [ ] **Step 1: Тесты.**

```js
test('form to params marks missing fields', () => {
  const p = formToParams({ ...emptyForm, category_id: 'food.coffee', format: 'takeaway', avg_check_rub: 350 });
  assert.deepEqual(p.missing.sort(), ['area_m2', 'audience', 'hours', 'ownership']);
  assert.equal(p.source, 'form');
  assertValid('params', p);
});
test('params to form and back is stable', () => {
  const p = JSON.parse(readFileSync('contract/examples/parse-response.json')).params;
  assert.deepEqual(formToParams(paramsToForm(p)), p);
});
test('submit without category is blocked', () => {
  assert.equal(canSubmit({ ...emptyForm, category_id: null }), false);
});
```
- [ ] **Step 2: Run** - FAIL; реализовать чистые функции - PASS.
- [ ] **Step 3: Раскладка.** После «Подтвердить» карта сворачивается в левую колонку (на телефоне - полоса сверху 30% высоты) с выбранным зданием в наклоне; справа анкета выезжает за 400 мс. Вкладки «Анкета» / «Своими словами». Анкета: три большие кнопки групп с иконками → сетка плиток категорий (иконка + 1-2 слова); после выбора плитки - ряд чипов формата, ползунок чека 100-5000 ₽ шаг 50 с подписью значения, двойной ползунок часов 0-24 и чипы дней, чипы аудитории с иконками, «Ещё» раскрывает площадь и «своя / сеть / франшиза». Не выбранная категория подсвечивает сетку плиток и не даёт нажать «Рассчитать».
- [ ] **Step 4: Своими словами.** Поле до 2000 символов, «Разобрать» (показывает бегущую строку загрузки), затем блок «Мы поняли так»: чипы параметров зелёные, `missing` жёлтые; клик по чипу переключает на анкету с этим полем. Ошибка разбора - «Не получилось разобрать, заполните анкету».
- [ ] **Step 5: Проверка в браузере.** Поток: выбрать здание → Подтвердить → плитка «Кофейня» → чипы → «Рассчитать» активна; вкладка текста с примером из теста даёт те же чипы; текст «хочу что-нибудь открыть» подсвечивает плитки.
- [ ] **Step 6: Commit** `feat: questionnaire tiles and free-text parsing`.

### Task 6: Результат - 3D-сцена и панель карточки

**Files:**
- Create: `app/scene.mjs`, `app/result-panel.mjs`, `tests/result-panel.test.mjs`
- Modify: `app/main.mjs`, `app/map-view.mjs` (`setMode('result')`: `maxPitch 60`, вращение включено), `app/app.css`

**Interfaces:**
- Consumes: `card` (Task 2-3), `MapView` (Task 4), `localIntensity` (Task 3).
- Produces: `scene.mjs`: `playCalculating(view, point): { stop(): void }` (кольцо от 0 до 800 м, 1,2 с по кругу, пока ждём ответ); `showResult(view, card): SceneHandle`, `SceneHandle = { highlight(indicatorId | null), setPeriod('morning'|'day'|'evening'), destroy() }`. `result-panel.mjs`: `panelModel(card): PanelModel` (чистая) и `mountResultPanel(el, card, { onHighlight, onPeriod, onExplain, onCompare, onPrint, onNew })`. `PanelModel = { title, subtitle, score: { value, ring: 0..1 } | null, forecast: { kind: 'validated', pct, low, high, city } | { kind: 'pending', message }, flows: { label, bars: [{ id, label, hours, rel }] , numbers: string | null }, rows: [{ id, icon, label, value, bar: 0..1 | null, effect }], banner: string | null }`.

- [ ] **Step 1: Тесты модели панели.**

```js
test('validated card shows percent and interval', () => {
  const m = panelModel(validatedCard);
  assert.deepEqual(m.forecast, { kind: 'validated', pct: 84, low: 71, high: 91, city: 79 });
});
test('not validated card hides percent', () => {
  const m = panelModel(notValidatedCard);
  assert.equal(m.forecast.kind, 'pending');
  assert.ok(!JSON.stringify(m.forecast).includes('%'));
});
test('flows always carry label; illustration has no numbers', () => {
  const m = panelModel(notValidatedCard);
  assert.equal(m.flows.label, notValidatedCard.flows.label);
  assert.equal(m.flows.numbers, null);
});
test('stub engine shows banner', () => {
  assert.equal(panelModel({ ...notValidatedCard, engine: { ...notValidatedCard.engine, kind: 'stub' } }).banner, 'Примерные данные');
});
test('row values are formatted in Russian', () => {
  const row = panelModel(validatedCard).rows.find((r) => r.id === 'pop_400');
  assert.equal(row.value, '9 400 чел.');
});
```
`bars.rel` при `status = illustration` - из `localIntensity`, при `estimate` - `value / max(value)`. Категория по-русски - из `CATEGORIES`, подзаголовок «Кофейня · навынос».
- [ ] **Step 2: Run** - FAIL; реализовать `panelModel` и `app/format.mjs` - PASS.
- [ ] **Step 3: Сцена.** После «Рассчитать»: карта раскрывается на весь экран, камера к точке (зум 16, наклон 55°, 1,4 с), `playCalculating` до ответа. Затем: все здания в кадре - `fill-extrusion` условной высоты 14 м (`#d9d1bb`, прозрачность 0,85), выбранное 24 м `#3b7561` со свечением (второй слой чуть шире, прозрачность пульсирует); кольцо 800 м пунктиром; метки объектов (до 40 сильнейших - HTML-метки с иконкой в кружке, остальные - кружки слоя) появляются по очереди с шагом 40 мс, подъём и масштаб от 0,6; медленный облёт 4°/с до первого касания карты. `highlight(id)` поднимает метки показателя и приглушает остальные.
- [ ] **Step 4: Панель.** Справа 380 px (телефон - выдвижная снизу, свёрнута до заголовка и оценки). Сверху адрес и подзаголовок; кольцо оценки заполняется за 800 мс, число отсчитывается; блок прогноза: процент крупно, полоса интервала, отметка доли по городу - или пунктирная плашка «Прогноз пока недоступен» и `message`; потоки - три полоски, переключатель периода (меняет сцену), подпись `flows.label`; строки показателей «иконка, подпись, значение, полоска», наведение → `highlight`; кнопки «Разбор от ИИ», «К сравнению», «PDF», «Новая точка». Плашка `banner`, если есть.
- [ ] **Step 5: Проверка в браузере.** Дубравная 36, кофейня: кольцо расчёта, облёт, метки, панель с оценкой и «Прогноз пока недоступен»; `?forecast=validated` - процент и интервал; наведение на «Конкуренты» поднимает кафе; облёт останавливается касанием. Замер: `performance` в devtools, кадры не ниже ~45 в секунду на ноутбуке.
- [ ] **Step 6: Commit** `feat: 3D result scene and card panel`.

### Task 7: «Дым» потоков и линии влияния

**Files:**
- Create: `app/smoke.mjs`, `tests/smoke.test.mjs`
- Modify: `app/scene.mjs` (подключить холст, `setPeriod`, `highlight`)

**Interfaces:**
- Consumes: `card.flows.segments`, `card.map.points`, `MapView.map`.
- Produces: `createSmoke(map, { segments, points, center, reducedMotion }): { setPeriod(p), highlight(kind | null), destroy() }`; чистые помощники `buildPaths(segments): Path[]` (`{ coords, length_m, cumulative[] }`) и `spawnWeights(paths, segments, period): Float32Array` (суммы до 1).

- [ ] **Step 1: Тесты помощников.**

```js
test('spawn weights follow period intensity', () => {
  const w = spawnWeights(paths, segments, 'morning');
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-6);
  assert.ok(w[0] > w[1]); // в фикстуре утро отрезка 0 = 0.9, отрезка 1 = 0.5 (длины равны)
});
test('paths have positive length', () => {
  assert.ok(buildPaths(segments).every((p) => p.length_m > 0 && p.cumulative.at(-1) === p.length_m));
});
```
- [ ] **Step 2: Run** - FAIL; реализовать помощники - PASS.
- [ ] **Step 3: Холст.** `<canvas>` поверх карты, `pointer-events: none`, под панелью, с учётом `devicePixelRatio`. Частица: путь, позиция вдоль пути (м), скорость 1,1-1,6 м/с × масштаб анимации 25, история последних 10 позиций в градусах; каждый кадр позиции проецируются `map.project`, шлейф - ломаная с убывающей прозрачностью, `globalCompositeOperation = 'lighter'`, цвет тёплый белый `rgba(255,244,214,·)` с ореолом. Число частиц - `min(700, 40 + 900 × сумма интенсивностей)`, при падении кадров ниже 40/с - минус 20%. Смена периода - веса плавно перетекают за 600 мс, частицы доживают свой путь. Линии влияния: от объекта к центру, кривая Безье с подъёмом, цвет зелёный `#5fbf8f` / красный `#e0795b`, толщина 1-4 px по `strength`, бегущая светлая точка 1 раз в 2,5 с; `highlight(kind)` оставляет яркими линии этого типа. `reducedMotion` - один статичный кадр: отрезки потоков линиями с прозрачностью по интенсивности, линии влияния без бегущей точки.
- [ ] **Step 4: Проверка в браузере.** Дым течёт по улицам, гуще у метро утром; переключение «вечер» перестраивает плавно; облёт не размазывает шлейфы; при эмуляции `prefers-reduced-motion` всё статично; кадры ~45+ в секунду.
- [ ] **Step 5: Commit** `feat: smoke flow particles and influence lines`.

### Task 8: Разбор от ИИ, сравнение, печать, документация

**Files:**
- Create: `app/compare.mjs`, `tests/compare.test.mjs`
- Modify: `app/result-panel.mjs` (разбор), `app/main.mjs`, `app/app.css` (печать), `README.md`, `map/SOURCES.md`

**Interfaces:**
- Consumes: `explain` (Task 2), `SceneHandle.highlight` (Task 6).
- Produces: `compareStore(storage = safeLocalStorage): { list(): Card[], add(card): Card[], remove(card_id), clear() }` (до 5, дубликат по `card_id` не добавляется, сбой хранилища - работа в памяти); `compareModel(cards): Array<{ card_id, address, score, forecast, top: string[] }>`.

- [ ] **Step 1: Тесты.**

```js
test('compare store keeps five unique cards', () => {
  const s = compareStore(memoryStorage());
  for (let i = 0; i < 7; i++) s.add({ ...card, card_id: `c_${i}xxxxx` });
  s.add({ ...card, card_id: 'c_6xxxxx' });
  assert.equal(s.list().length, 5);
});
test('compare store survives throwing storage', () => {
  const s = compareStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.equal(s.add(card).length, 1);
});
```
- [ ] **Step 2: Run** - FAIL; реализовать - PASS.
- [ ] **Step 3: Разбор.** «Разбор от ИИ» → загрузка (бегущая строка) → три колонки-списка «Сильное / Слабое / Проверить на месте» с иконками; наведение на пункт → `highlight` его `indicator_ids`. Ошибка или `llm_failed` - «Разбор сейчас недоступен».
- [ ] **Step 4: Сравнение.** «К сравнению» - счётчик-значок в шапке; экран сравнения - карточки рядом (оценка кольцом, прогноз или «недоступен», 3 главных показателя), «Убрать», клик → открыть карточку.
- [ ] **Step 5: Печать.** «PDF» → снимок карты (`map.once('render')` + `getCanvas().toDataURL()` в том же кадре после `triggerRepaint`) вставляется картинкой, печатная вёрстка: панель карточки на листе A4, без кнопок; затем `print()`.
- [ ] **Step 6: Документация.** `README.md`: что умеет приложение, путь пользователя, как включить сервер (`config.mjs`), где контракт, команды `node --test tests/` и `python tools/check_contract.py`, `example.html`. `map/SOURCES.md`: `metro.json`, `addresses/` - производные OSM, ODbL.
- [ ] **Step 7: Полная проверка.** `node --test tests/` и `python tools/check_contract.py` - всё PASS. В браузере на компьютере и 375 px: главная → поиск → здание → анкета → расчёт → 3D и дым → разбор → к сравнению → сравнение → PDF; Overpass заблокирован (подменить `API` в devtools или офлайн) - примерные данные с плашкой; испорченный `#s=` - главная. Консоль без ошибок.
- [ ] **Step 8: Commit** `feat: explanation, comparison, print and docs`.
