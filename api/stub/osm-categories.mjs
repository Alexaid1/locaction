// 28 категорий стрит-ритейла в порядке contract/categories.json: короткая подпись для плитки, группа, иконка.
// Теги OSM конкурентов (osm) - для временного расчёта по Overpass.

export const GROUPS = [
  { id: 'food', label: 'Еда и напитки', icon: 'food' },
  { id: 'retail', label: 'Магазин', icon: 'bag' },
  { id: 'services', label: 'Услуги', icon: 'service' },
];

const c = (id, label, icon) => ({ id, label, group: id.split('.')[0], icon });

export const CATEGORIES = [
  c('food.restaurant', 'Ресторан', 'restaurant'),
  c('food.cafe', 'Кафе', 'cafe'),
  c('food.coffee', 'Кофейня', 'coffee'),
  c('food.bar', 'Бар', 'bar'),
  c('food.hookah', 'Кальянная', 'hookah'),
  c('food.fast_food', 'Фастфуд', 'burger'),
  c('food.canteen', 'Столовая', 'canteen'),
  c('food.bakery', 'Пекарня', 'bread'),
  c('retail.supermarket', 'Супермаркет', 'cart'),
  c('retail.grocery', 'Продукты', 'basket'),
  c('retail.specialty_food', 'Лавка', 'cheese'),
  c('retail.alcohol', 'Алкоголь', 'wine'),
  c('retail.pharmacy', 'Аптека', 'pill'),
  c('services.beauty', 'Салон красоты', 'scissors'),
  c('services.barbershop', 'Барбершоп', 'razor'),
  c('services.nails', 'Маникюр', 'nail'),
  c('services.cosmetology', 'Косметолог', 'sparkle'),
  c('retail.clothing', 'Одежда', 'shirt'),
  c('retail.jewelry', 'Украшения', 'ring'),
  c('retail.cosmetics', 'Косметика', 'lipstick'),
  c('retail.electronics', 'Электроника', 'phone'),
  c('retail.tobacco', 'Табак', 'smoke'),
  c('retail.pets', 'Зоотовары', 'paw'),
  c('retail.other', 'Другой магазин', 'bag'),
  c('services.bank', 'Банк', 'bank'),
  c('services.household', 'Бытовые услуги', 'iron'),
  c('services.pickup', 'ПВЗ', 'box'),
  c('services.other', 'Другие услуги', 'service'),
];

export const categoryById = new Map(CATEGORIES.map((item) => [item.id, item]));
