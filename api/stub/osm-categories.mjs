// 28 категорий стрит-ритейла в порядке contract/categories.json: короткая подпись для плитки, группа, иконка.
// Теги OSM конкурентов (osm) - для временного расчёта по Overpass.

export const GROUPS = [
  { id: 'food', label: 'Еда и напитки', icon: 'food' },
  { id: 'retail', label: 'Магазин', icon: 'bag' },
  { id: 'services', label: 'Услуги', icon: 'service' },
];

const c = (id, label, icon, osm) => ({ id, label, group: id.split('.')[0], icon, osm });
const amenity = (...values) => [['amenity', values]];
const shop = (...values) => [['shop', values]];

export const CATEGORIES = [
  c('food.restaurant', 'Ресторан', 'restaurant', amenity('restaurant')),
  c('food.cafe', 'Кафе', 'cafe', amenity('cafe')),
  c('food.coffee', 'Кофейня', 'coffee', amenity('cafe')),
  c('food.bar', 'Бар', 'bar', amenity('bar', 'pub')),
  c('food.hookah', 'Кальянная', 'hookah', amenity('hookah_lounge')),
  c('food.fast_food', 'Фастфуд', 'burger', amenity('fast_food')),
  c('food.canteen', 'Столовая', 'canteen', amenity('canteen', 'food_court')),
  c('food.bakery', 'Пекарня', 'bread', shop('bakery', 'pastry', 'confectionery')),
  c('retail.supermarket', 'Супермаркет', 'cart', shop('supermarket')),
  c('retail.grocery', 'Продукты', 'basket', shop('convenience', 'grocery')),
  c('retail.specialty_food', 'Лавка', 'cheese', shop('butcher', 'cheese', 'deli', 'greengrocer', 'seafood', 'tea', 'coffee')),
  c('retail.alcohol', 'Алкоголь', 'wine', shop('alcohol', 'wine', 'beverages')),
  c('retail.pharmacy', 'Аптека', 'pill', amenity('pharmacy')),
  c('services.beauty', 'Салон красоты', 'scissors', shop('hairdresser')),
  c('services.barbershop', 'Барбершоп', 'razor', shop('hairdresser')),
  c('services.nails', 'Маникюр', 'nail', shop('beauty')),
  c('services.cosmetology', 'Косметолог', 'sparkle', shop('beauty')),
  c('retail.clothing', 'Одежда', 'shirt', shop('clothes', 'shoes')),
  c('retail.jewelry', 'Украшения', 'ring', shop('jewelry', 'watches')),
  c('retail.cosmetics', 'Косметика', 'lipstick', shop('cosmetics', 'perfumery')),
  c('retail.electronics', 'Электроника', 'phone', shop('electronics', 'mobile_phone', 'computer')),
  c('retail.tobacco', 'Табак', 'smoke', shop('tobacco', 'e-cigarette')),
  c('retail.pets', 'Зоотовары', 'paw', shop('pet')),
  c('retail.other', 'Другой магазин', 'bag', shop('gift', 'books', 'stationery', 'florist', 'variety_store', 'hardware')),
  c('services.bank', 'Банк', 'bank', amenity('bank', 'bureau_de_change')),
  c('services.household', 'Бытовые услуги', 'iron', shop('dry_cleaning', 'laundry', 'tailor', 'shoe_repair')),
  c('services.pickup', 'ПВЗ', 'box', shop('outpost')),
  c('services.other', 'Другие услуги', 'service', shop('copyshop', 'photo', 'travel_agency')),
];

export const categoryById = new Map(CATEGORIES.map((item) => [item.id, item]));
