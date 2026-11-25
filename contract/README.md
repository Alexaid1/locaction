# Контракт LOCACTION: анкета, карточка, разбор

Версия 1, 25.11.2026. На этот контракт ориентируются интерфейс (этот репозиторий), сервер расчёта и модель (`locaction-ml`), слой данных (`commercial-history`). Меняем только новой версией схемы (`locaction.card/2`), старую сервер отдаёт, пока интерфейс не переключится.

| Файл | Что |
|---|---|
| [params.schema.json](params.schema.json) | `locaction.params/1` - параметры бизнеса из анкеты или разбора текста LLM |
| [card.schema.json](card.schema.json) | `locaction.card/1` - карточка точки |
| [explain.schema.json](explain.schema.json) | `locaction.explain/1` - разбор карточки от LLM |
| [categories.json](categories.json) | 28 категорий стрит-ритейла, копия `commercial-history/data/reference/categories.csv` |
| [examples/](examples/) | Карточка с подтверждённой моделью, карточка без прогноза, ответы разбора |

Проверка любого файла по схеме: `python tools/check_contract.py card my-card.json` (нужен `jsonschema`). Без аргументов проверяет все примеры.

## API

Один базовый адрес, все запросы - JSON, `POST`. В интерфейсе адрес задаётся в [config.mjs](../config.mjs): `stub` - встроенная заглушка, иначе URL сервера.

| Запрос | Тело | Ответ | Кто считает |
|---|---|---|---|
| `POST /v1/parse` | `{ "text": "..." }` до 2000 символов | `{ "params": locaction.params/1 }` | дешёвая LLM по API, строго по схеме |
| `POST /v1/card` | `{ "point": { "lat", "lon" }, "building": { "osm", "unom" } \| null, "params": locaction.params/1 }` | `locaction.card/1` | признаки из готовых слоёв + модель |
| `POST /v1/explain` | `{ "card_id": "..." }` | `locaction.explain/1` | LLM, получает только числа карточки |

Ошибки: HTTP 4xx/5xx и тело `{ "error": { "code": "out_of_area" | "bad_params" | "llm_failed" | "internal", "message": "..." } }`. `message` - короткий текст для пользователя по-русски.

## Правила, которые важнее схемы

1. **Прогноз только подтверждённый.** `forecast.probability` не `null` только при `status = "validated"`: модель на отложенных периодах и районах лучше базовых линий и откалибрована (ИКР 6.4). Иначе `status = "not_validated"`, интерфейс пишет «прогноз пока недоступен» и показывает только оценку места.
2. **Никаких сырых данных 2ГИС.** В `map.points` попадают только объекты из открытых источников (`osm`, `mos_data`). Всё, что посчитано по 2ГИС, - только счётчики и доли в `place.indicators`. В `sources` 2ГИС не указывается как источник объектов.
3. **Потоки - всегда с подписью.** `flows.label` показывается рядом с любым числом и рисунком потоков. `status = "illustration"` - рисунок по улицам без модели, числа `null`.
4. **LLM не придумывает числа.** Сервер проверяет `explain` и заполняет `check.unknown_numbers`. Если список не пуст, разбор не отдаётся. Та же проверка есть в `tools/check_contract.py`.
5. **`params.category_id` обязателен для карточки.** `/v1/parse` может вернуть `null`, если не понял тип, - интерфейс попросит выбрать плитку.

## Карточка по блокам

- `point` - точка, адрес и здание (`osm`, `unom`, тип, этажность, год). Этажность и год могут быть `null`.
- `params` - эхо параметров, по которым считали.
- `engine` - кто считал: `stub`, `demo_index_v2` (временный расчёт по OSM) или `model`; версия признаков и дата данных.
- `place.score` - оценка места 0-100 и процентиль среди точек Москвы той же категории. `place.indicators` - до 12 объяснимых показателей. `percentile_city` уже учитывает направление: 80 = лучше 80% точек (для конкурентов меньше - лучше).
- `forecast` - прогноз на 12 мес.: вероятность, интервал (`level` 0.8 = 80%), базовые доли по городу и категории, качество модели, главные факторы `drivers` (ссылки на `indicators`).
- `flows` - поток людей мимо точки утром, днём, вечером: значение и интервал, чел./ч; `segments` - отрезки улиц с относительной интенсивностью 0..1 для анимации.
- `map` - объекты влияния в радиусе `radius_m` для 3D-вида: тип, расстояние, плюс или минус, сила 0..1.
- `field_checks`, `limits`, `sources` - короткие строки и источники с датами.
- `explain` - доступен ли разбор; `price_rub = null` - цену не показываем (решение 25.11.2026: что платное, решим позже).

## Показатели: какие id использовать

Желательно брать имена признаков `FEATURE_NAMES` из `commercial-history/src/commercial_history/features/point.py`, чтобы карточка и модель говорили на одном языке. Интерфейс знает подписи и иконки для этих:

| id | Подпись | icon | Зона |
|---|---|---|---|
| `metro_dist_m` | До метро | metro | point |
| `stops_300` | Остановки | stop | r300 |
| `osm_same_400` | Конкуренты | competitor | r400 |
| `pop_400` | Жители рядом | residents | r400 |
| `office_poi_800` | Офисы | office | r800 |
| `anchor_supermarket_400` | Супермаркеты | anchor | r400 |
| `anchor_mall_800` | ТЦ | anchor | r800 |
| `university_800` | Вузы | university | r800 |
| `place_prev_businesses_40` | Смены арендаторов | history | point |
| `flow_est` | Поток мимо | flow | point |

Временный расчёт по демо-индексу v2 использует свои id: `competitors_300`, `metro_dist_m`, `stops_300`, `offices_500`, `attractors_300`.

## Параметры анкеты

| Поле | Значения | Анкета спрашивает |
|---|---|---|
| `category_id` | 28 листьев справочника | плитки с иконками |
| `format` | `takeaway`, `seating`, `kiosk`, `store`, `service_room`, `pickup` | чипы |
| `avg_check_rub` | целое | ползунок |
| `hours` | `open`, `close` ЧЧ:ММ, `days`: `daily` / `weekdays` / `weekends` | ползунок времени и чипы |
| `audience` | `commuters`, `residents`, `office_workers`, `students`, `tourists`, `families`, `drivers` | чипы, можно несколько |
| `area_m2` | число | необязательно |
| `ownership` | `independent`, `chain`, `franchise` | необязательно |

`missing` - что пользователь не указал. Модель v1 использует только `category_id`, остальное идёт в объяснения и следующие версии. Качество разбора LLM проверяется на тестовом наборе анкет отдельно от прогноза (ИКР 6.5).
