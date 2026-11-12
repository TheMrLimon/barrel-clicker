'use strict';

/* ------------------------------------------------------------------
   Barrel Clicker 2 — данные, экономика и сохранения
------------------------------------------------------------------- */

const STORAGE_KEY = 'barrelClicker.save.v1';

/* Уровни бочек.
   Доход растёт в 2.66 раза за уровень: слияние двух одинаковых бочек
   даёт сумму их дохода × 1.33 (1 + 1 → 3, 3 + 3 → 8 и так далее). */
const BASE_TIERS = [
  { id: 'wood',        name: 'Деревянная',    color: '#b07a3c', income: 1,     cost: 45,        icon: '🪵', desc: 'Пахнет смолой' },
  { id: 'iron',        name: 'Железная',      color: '#9aa4ad', income: 3,     cost: 196,       icon: '🔩', desc: 'Гулко звенит' },
  { id: 'gold',        name: 'Золотая',       color: '#e0b64a', income: 8,     cost: 757,       icon: '🏅', desc: 'Тяжёлая зараза' },
  { id: 'emerald',     name: 'Изумрудная',    color: '#2fbf71', income: 21,    cost: 2880,      icon: '🟢', desc: 'Дорогая на вид' },
  { id: 'ruby',        name: 'Рубиновая',     color: '#e0455a', income: 56,    cost: 11100,     icon: '🔴', desc: 'Внутри тепло' },
  { id: 'obsidian',    name: 'Обсидиановая',  color: '#6a6280', income: 149,   cost: 43000,     icon: '⚫', desc: 'Отполирована вулканом' },
  { id: 'crystal',     name: 'Кристальная',   color: '#6fe3ff', income: 396,   cost: 166000,    icon: '🔷', desc: 'Звенит на солнце' },
  { id: 'void',        name: 'Бочка Бездны',  color: '#7a4dff', income: 1053,  cost: 639000,    icon: '🟣', desc: 'Шёпот изнутри' },
  { id: 'quantum',     name: 'Квантовая',     color: '#24e0a2', income: 2801,  cost: 2460000,   icon: '🟩', desc: 'В двух местах сразу' },
  { id: 'plasma',      name: 'Плазменная',    color: '#ff6b3d', income: 7451,  cost: 9500000,   icon: '🟠', desc: 'Руками не трогать' },
  { id: 'divine',      name: 'Божественная',  color: '#ffe066', income: 19820, cost: 36600000,  icon: '🟡', desc: 'Светится изнутри' },
  { id: 'singularity', name: 'Сингулярность', color: '#ff2e88', income: 52721, cost: 141000000, icon: '💗', desc: 'Внутри — целая вселенная' },
];

/* Всего уровней бочек: 12 ручных + 500 сгенерированных = 512. */
const TIER_TOTAL = 512;

/* 20 рангов × 25 материалов = 500 уникальных названий для новых бочек. */
const TIER_RANKS = [
  'Кованая', 'Закалённая', 'Рунная', 'Древняя', 'Проклятая',
  'Благословенная', 'Призрачная', 'Ледяная', 'Огненная', 'Грозовая',
  'Лунная', 'Солнечная', 'Звёздная', 'Туманная', 'Хрустальная',
  'Космическая', 'Временная', 'Парадоксальная', 'Бесконечная', 'Абсолютная',
];

const TIER_MATERIALS = [
  'аметистовая', 'алмазная', 'титановая', 'мифриловая', 'адамантовая',
  'хромовая', 'кобальтовая', 'никелевая', 'медная', 'серебряная',
  'платиновая', 'иридиевая', 'осмиевая', 'урановая', 'плутониевая',
  'гранатовая', 'сапфировая', 'топазная', 'ониксовая', 'небесная',
  'демоническая', 'ангельская', 'хаотичная', 'пустотная', 'первичная',
];

const TIER_FLAVOR = [
  'Пахнет древней магией', 'Гудит на низкой частоте', 'Холодит ладони',
  'Искрит при касании', 'Внутри что-то шевелится', 'Тяжелее, чем кажется',
  'Светится в темноте', 'Отбрасывает две тени', 'Пахнет грозой',
  'Тёплая даже зимой', 'Слегка вибрирует', 'Звенит как колокол',
  'Покрыта рунами', 'Не отражается в зеркале', 'Шелестит сама собой',
  'Собрана из осколков', 'Пахнет железом и озоном', 'Тянет к магнитам',
  'Мерцает на свету', 'Хранит чей-то секрет',
];

const TIER_ICONS = ['🛢️', '⚙️', '🔩', '💎', '🔮', '🌟', '🔥', '❄️', '⚡', '🌌', '☄️', '👑'];

function hslToHex(hue, sat, light) {
  const h = ((hue % 360) + 360) % 360;
  const s = sat / 100;
  const l = light / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

function buildTiers() {
  const list = BASE_TIERS.map((tier) => ({ ...tier }));
  const last = BASE_TIERS[BASE_TIERS.length - 1];
  const start = BASE_TIERS.length;

  for (let index = start; index < TIER_TOTAL; index++) {
    const step = index - start;
    const rank = TIER_RANKS[Math.floor(step / TIER_MATERIALS.length) % TIER_RANKS.length];
    const material = TIER_MATERIALS[step % TIER_MATERIALS.length];

    list.push({
      id: 'tier' + (index + 1),
      name: rank + ' ' + material,
      color: hslToHex(step * 137.508 + 24, 66, 52),
      income: Math.round(last.income * Math.pow(2.66, index - (start - 1))),
      cost: Math.round(last.cost * Math.pow(3.88, index - (start - 1))),
      icon: TIER_ICONS[step % TIER_ICONS.length],
      desc: TIER_FLAVOR[step % TIER_FLAVOR.length],
    });
  }

  return list;
}

const TIERS = buildTiers();

/* Улучшения. Почти всё покупается за скрап, «Усиление» — за золотой скрап.
   Стартовые цены и рост взяты с экрана улучшений Scrap Clicker 2:
   Faster Barrels 1 000 (×2), Better Barrels 20 000 (×4),
   More Magnets 250 000 (×2), Doubled Barrel 800 000 (×2),
   Better Barrels II 1,25 млн (×3), Better Storms 2,25 млн (×4),
   Offline Production 1 млн (×10). */
/* «Больше — лучше»: до 5 дополнительных клеток для появления бочек.
   Первая стоит 1 млрд скрапа, каждая следующая — в 1000 раз дороже. */
const BIGGER_MAX = 5;

const UPGRADES = {
  spawn: {
    name: 'Быстрый конвейер', icon: '⏩', color: 'blue',
    desc: 'Бочки появляются на 0,1 с быстрее',
    base: 1000, growth: 2, max: 40, currency: 'scrap',
  },
  level: {
    name: 'Стартовый уровень', icon: '⬆️', color: 'green',
    desc: 'Новые бочки на уровень выше, старые на поле тоже повышаются',
    base: 20000, growth: 4, max: TIERS.length - 1, currency: 'scrap',
  },
  magnet: {
    name: 'Магниты', icon: '🧲', color: 'red',
    desc: '+2% шанс получить магнит при появлении бочки',
    base: 250000, growth: 2, max: 25, currency: 'scrap',
  },
  double: {
    name: 'Двойная бочка', icon: '👥', color: 'purple',
    desc: '+1% шанс, что появляются две бочки сразу',
    base: 800000, growth: 2, max: 25, currency: 'scrap',
  },
  levelSpeed: {
    name: 'Быстрая прокачка', icon: '⭐', color: 'gold',
    desc: '+10% опыта за каждое слияние',
    base: 1250000, growth: 3, max: 20, currency: 'scrap',
  },
  stormPower: {
    name: 'Сила шторма', icon: '⚡', color: 'gold',
    desc: '+1 бочка и +3 магнита за шторм',
    base: 2250000, growth: 4, max: 15, currency: 'scrap',
  },
  offline: {
    name: 'Офлайн-добыча', icon: '🌙', color: 'blue',
    desc: '+30 минут офлайн-дохода',
    base: 1000000, growth: 10, max: 8, currency: 'scrap',
  },
  stormTime: {
    name: 'Больше штормов', icon: '🌪️', color: 'green',
    desc: 'Шторм приходит на 10% быстрее',
    base: 620, growth: 1.9, max: 10, currency: 'scrap',
  },
  goldenChance: {
    name: 'Золотой скрап', icon: '🏅', color: 'gold',
    desc: '+5% золотого скрапа при перезапуске',
    base: 5000, growth: 2.15, max: 20, currency: 'scrap',
  },
  boost: {
    name: 'Усиление', icon: '🔥', color: 'red',
    desc: '+1% к бонусу за каждые 100 золотого скрапа',
    base: 3, growth: 1.6, max: 30, currency: 'goldenScrap',
  },
  bigger: {
    name: 'Больше — лучше', icon: '📦', color: 'purple',
    desc: 'Ещё одна клетка для появления бочек — до 5 штук. Клетки сохраняются после престижа',
    base: 1000000000, growth: 1000, max: BIGGER_MAX, currency: 'scrap',
  },
};

/* Магазин «Магнит»: постоянные улучшения за 🧲. Переживают престиж.
   Стартовая цена — от 300 магнитов, эффекты намеренно небольшие. */
const MAGNET_UPGRADES = {
  grip: {
    name: 'Цепкий магнит', icon: '📎', color: 'red',
    desc: '+1% шанс получить магнит при появлении бочки',
    base: 300, growth: 1.55, max: 5,
  },
  economy: {
    name: 'Экономия', icon: '💸', color: 'green',
    desc: 'Вызов шторма дешевле на 1 магнит',
    base: 350, growth: 1.6, max: 5,
  },
  longStorm: {
    name: 'Долгий шторм', icon: '⏳', color: 'blue',
    desc: '+0,6 с к длительности магнитного шторма',
    base: 400, growth: 1.6, max: 5,
  },
  catchDouble: {
    name: 'Щедрый улов', icon: '🎣', color: 'gold',
    desc: '+2% шанс, что пойманный магнит даст +2 вместо +1',
    base: 450, growth: 1.65, max: 5,
  },
  warm: {
    name: 'Тёплый карман', icon: '🧤', color: 'purple',
    desc: '+4 минуты офлайн-дохода',
    base: 500, growth: 1.6, max: 5,
  },
};

function magnetUpgradeCost(key, level) {
  const u = MAGNET_UPGRADES[key];
  if (!u) return Infinity;
  return Math.max(1, Math.ceil(u.base * Math.pow(u.growth, level)));
}

function magnetShopLevel(st, key) {
  return (st.magnetShop && st.magnetShop[key]) || 0;
}

/* Вызов шторма: 10 🧲, «Экономия» снижает до 5 */
const STORM_CALL_COST = 10;

function stormCallCost(st) {
  return Math.max(5, STORM_CALL_COST - magnetShopLevel(st, 'economy'));
}

/* ---------------------------------- поле ---------------------------------- */

const FIELD_COLS = 8;
const FIELD_ROWS = 4;
const FIELD_SIZE = FIELD_COLS * FIELD_ROWS;

/* Размер поля с учётом «Больше — лучше»: 32 + 0…5 дополнительных клеток */
function fieldSize(st) {
  const extra = st && st.upgrades ? Number(st.upgrades.bigger) || 0 : 0;
  return FIELD_SIZE + Math.max(0, Math.min(BIGGER_MAX, Math.floor(extra)));
}

const SPAWN_BASE = 5;          // секунд на старте
const SPAWN_STEP = 0.1;        // на сколько быстрее каждый уровень
const SPAWN_MAX_LEVEL = 40;    // максимум улучшений скорости
const SPAWN_MIN = SPAWN_BASE - SPAWN_STEP * SPAWN_MAX_LEVEL; // 1,0 с на максимуме

const STORM_BASE = 300;        // 5 минут между штормами
const STORM_STEP = 0.9;        // каждый уровень −10%
const STORM_MIN = 60;
const STARS_MAX = 10;

function spawnInterval(st) {
  const level = Math.min(SPAWN_MAX_LEVEL, st.upgrades.spawn || 0);
  return Math.max(SPAWN_MIN, SPAWN_BASE - SPAWN_STEP * level);
}

/* Купленный стартовый уровень: 0 → 1-я бочка, 1 → 2-я, … 11 → 12-я */
function spawnLevel(st) {
  return Math.min(TIERS.length - 1, Math.max(0, st.upgrades.level || 0));
}

function magnetChance(st) {
  const shop = magnetShopLevel(st, 'grip') * 0.01;
  return Math.min(0.5, (st.upgrades.magnet || 0) * 0.02 + shop);
}

function doubleChance(st) {
  return Math.min(0.25, (st.upgrades.double || 0) * 0.01);
}

function stormInterval(st) {
  return Math.max(STORM_MIN, STORM_BASE * Math.pow(STORM_STEP, st.upgrades.stormTime || 0));
}

/* Магнитный шторм: сколько магнитов падает за один шторм */
const STORM_MAGNET_BASE = 18;
const STORM_MAGNET_PER_LEVEL = 3;

function stormMagnetCount(st) {
  return STORM_MAGNET_BASE + STORM_MAGNET_PER_LEVEL * (st.upgrades.stormPower || 0);
}

function offlineSeconds(st) {
  const warm = 4 * magnetShopLevel(st, 'warm') / 60; /* +4 минуты за уровень */
  return (2 + 0.5 * (st.upgrades.offline || 0) + warm) * 3600;
}

/* Новые бочки появляются ровно того уровня, который куплен в улучшении */
function spawnTier(st) {
  return spawnLevel(st);
}

/* Бочки прошлого стартового уровня на поле повышаются до нового уровня.
   Возвращает индексы клеток, которые изменились (для анимации). */
function raiseFieldBarrels(st, oldTier, newTier) {
  const changed = [];
  if (!(newTier > oldTier)) return changed;

  st.field.forEach((cell, index) => {
    if (cell && cell.tier === oldTier) {
      cell.tier = newTier;
      changed.push(index);
    }
  });

  return changed;
}

function fieldIncome(st) {
  let sum = 0;
  for (const cell of st.field) {
    if (cell && TIERS[cell.tier]) sum += TIERS[cell.tier].income;
  }
  return sum;
}

function fieldCount(st) {
  return st.field.filter(Boolean).length;
}

/* ---------------------------------- уровни и престиж ---------------------------------- */

function xpNeeded(level) {
  return Math.round(10 * Math.pow(1.16, Math.max(0, level - 1)));
}

function xpGain(st) {
  return 1 * (1 + 0.1 * (st.upgrades.levelSpeed || 0));
}

function goldenGain(st) {
  const base = Math.sqrt(Math.max(0, st.totalScrap || 0) / 1000);
  return Math.floor(base * (1 + 0.05 * (st.upgrades.goldenChance || 0)));
}

/* Престиж: первый перезапуск с 1 млн скрапа за забег,
   каждые 5 перезапусков требование растёт в 10 раз (1 млн → 10 млн → 100 млн …). */
const PRESTIGE_BASE = 1000000;
const PRESTIGE_STEP = 5;
const PRESTIGE_GROWTH = 10;

function prestigeRequirement(st) {
  const restarts = Math.max(0, st.restarts || 0);
  return PRESTIGE_BASE * Math.pow(PRESTIGE_GROWTH, Math.floor(restarts / PRESTIGE_STEP));
}

function prestigeReady(st) {
  return (st.totalScrap || 0) >= prestigeRequirement(st);
}

/* Каждые 100 золотого скрапа дают +10% к доходу (база — 100%).
   «Усиление» добавляет ещё +1% к бонусу за уровень:
   0 ур. — 10% за 100 🏅, 30 ур. — 40% за 100 🏅. */
const GOLDEN_BLOCK = 100;
const GOLDEN_BLOCK_BONUS = 0.10;

function boostPerGolden(st) {
  /* доля дохода за одну единицу золотого скрапа */
  return (GOLDEN_BLOCK_BONUS + 0.01 * (st.upgrades.boost || 0)) / GOLDEN_BLOCK;
}

function goldenBonusPercent(st) {
  /* сколько процентов дохода дают 100 золотого скрапа */
  return GOLDEN_BLOCK_BONUS + 0.01 * (st.upgrades.boost || 0);
}

function multiplier(st) {
  const goldenBoost = 1 + (st.goldenScrap || 0) * boostPerGolden(st);
  const starBoost = 1 + 0.10 * Math.min(STARS_MAX, st.stars || 0);
  const levelBoost = 1 + 0.05 * Math.max(0, (st.level || 1) - 1);

  return goldenBoost * starBoost * levelBoost;
}

/* ---------------------------------- состояние ---------------------------------- */

function defaultUpgrades() {
  const upgrades = {};
  for (const key of Object.keys(UPGRADES)) upgrades[key] = 0;
  return upgrades;
}

function defaultMagnetShop() {
  const shop = {};
  for (const key of Object.keys(MAGNET_UPGRADES)) shop[key] = 0;
  return shop;
}

function defaultState() {
  const barrels = {};
  for (const t of TIERS) barrels[t.id] = 0;

  return {
    v: 2,
    scrap: 0,
    totalScrap: 0,
    goldenScrap: 0,
    magnets: 0,
    stars: 0,
    restarts: 0,
    level: 1,
    xp: 0,
    merges: 0,
    storms: 0,
    spawns: 0,
    trashed: 0,
    barrels,
    upgrades: defaultUpgrades(),
    magnetShop: defaultMagnetShop(),
    field: new Array(FIELD_SIZE).fill(null),
    fieldSeq: 1,
    spawnTimer: 0,
    stormTimer: 0,
    lastTick: Date.now(),
  };
}

function loadState() {
  const base = defaultState();
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') return base;

  const st = Object.assign(base, saved);
  st.barrels = Object.assign(defaultState().barrels, saved.barrels || {});
  st.upgrades = Object.assign(defaultState().upgrades, saved.upgrades || {});
  st.magnetShop = Object.assign(defaultMagnetShop(), saved.magnetShop || {});

  /* переносим старые валюты в новые, чтобы прогресс не пропал */
  if (!saved.goldenScrap) st.goldenScrap = Math.max(0, Number(saved.gold) || 0);
  if (!saved.magnets) st.magnets = Math.max(0, Number(saved.gems) || 0);
  if (!saved.stars) {
    const legacy = (Number(saved.prestige) || 0)
      + (Number(saved.prestigeGold) || 0) * 2
      + (Number(saved.prestigeDiamond) || 0) * 5
      + (Number(saved.diamonds) || 0);
    st.stars = Math.min(STARS_MAX, legacy);
  }
  if (!saved.level) st.level = 1;
  if (!saved.xp) st.xp = 0;
  if (!saved.merges) st.merges = 0;

  /* защищаемся от битых значений в улучшениях */
  for (const key of Object.keys(UPGRADES)) {
    const max = UPGRADES[key].max;
    const value = Number(st.upgrades[key]) || 0;
    st.upgrades[key] = Math.max(0, Math.min(max, Math.floor(value)));
  }

  for (const key of Object.keys(MAGNET_UPGRADES)) {
    const max = MAGNET_UPGRADES[key].max;
    const value = Number(st.magnetShop[key]) || 0;
    st.magnetShop[key] = Math.max(0, Math.min(max, Math.floor(value)));
  }

  /* поле слияния: аккуратно чиним старые сохранения */
  const savedField = Array.isArray(saved.field) ? saved.field : [];
  const size = fieldSize(st);
  st.field = new Array(size).fill(null);
  for (let i = 0; i < size; i++) {
    const cell = savedField[i];
    const tier = cell && typeof cell.tier === 'number' ? cell.tier : -1;
    st.field[i] = TIERS[tier] ? { id: Number(cell.id) || i + 1, tier } : null;
  }
  st.fieldSeq = Number(saved.fieldSeq) || 1;
  st.spawnTimer = Math.max(0, Number(saved.spawnTimer) || 0);
  const savedStorm = Number(saved.stormTimer);
  st.stormTimer = savedStorm > 0 && savedStorm < stormInterval(st) ? savedStorm : 0;

  return st;
}

function saveState(st) {
  st.lastTick = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  } catch (e) {
    console.warn('Не удалось сохранить прогресс', e);
  }
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

function resetRun(st) {
  /* «Усиление» покупается за золотой скрап, «Больше — лучше» — за скрап,
     но обе вещи переживают перезапуск */
  const premiumBoost = st.upgrades.boost || 0;
  const extraCells = st.upgrades.bigger || 0;

  st.scrap = 0;
  st.totalScrap = 0;
  st.level = 1;
  st.xp = 0;
  st.merges = 0;
  st.spawns = 0;
  st.barrels = defaultState().barrels;
  st.upgrades = defaultUpgrades();
  st.upgrades.boost = premiumBoost;
  st.upgrades.bigger = extraCells;
  st.field = new Array(fieldSize(st)).fill(null);
  st.fieldSeq = 1;
  st.spawnTimer = 0;
  st.stormTimer = 0;
}

/* ---------------------------------- экономика ---------------------------------- */

function upgradeCost(key, level) {
  const u = UPGRADES[key];
  const cost = u.base * Math.pow(u.growth, level);
  /* на очень высоких уровнях (×4 за шаг) цена выходит за пределы double */
  if (!Number.isFinite(cost)) return Number.MAX_VALUE;
  return Math.max(1, Math.ceil(cost));
}

function upgradeMaxed(key, level) {
  return level >= UPGRADES[key].max;
}

function barrelsIncome(st) {
  let sum = 0;
  for (const t of TIERS) sum += t.income * (st.barrels[t.id] || 0);
  return sum;
}

function perSecond(st) {
  return (barrelsIncome(st) + fieldIncome(st)) * multiplier(st);
}

function tierSingleCost(tier, owned) {
  return Math.ceil(tier.cost * Math.pow(1.15, owned));
}

function tierBulkCost(tier, owned, count) {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += tierSingleCost(tier, owned + i);
  return sum;
}

function tierUnlocked(st, index) {
  if (index === 0) return true;
  if ((st.barrels[TIERS[index - 1].id] || 0) > 0) return true;
  if (spawnLevel(st) >= index) return true;
  return (st.scrap || 0) >= TIERS[index].cost * 0.25;
}

/* ---------------------------------- утилиты ---------------------------------- */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd'];

function fmt(value) {
  if (value === Infinity) return '∞';
  if (!isFinite(value) || isNaN(value)) return '0';

  const negative = value < 0;
  let n = Math.abs(value);

  if (n < 1000) {
    const r = Math.round(n * 10) / 10;
    return (negative ? '-' : '') + (Number.isInteger(r) ? r : r.toFixed(1));
  }

  /* совковые суффиксы кончаются на Dd (10^39) — дальше пишем степень */
  if (n >= 1e42) {
    const exp = Math.floor(Math.log10(n));
    const mant = n / Math.pow(10, exp);
    const text = mant >= 100 ? mant.toFixed(0) : mant >= 10 ? mant.toFixed(1) : mant.toFixed(2);
    return (negative ? '-' : '') + text.replace(/\.?0+$/, '') + 'e' + exp;
  }

  let i = 0;
  while (n >= 1000 && i < SUFFIXES.length - 1) {
    n /= 1000;
    i++;
  }
  const text = n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n).toString();
  return (negative ? '-' : '') + text + SUFFIXES[i];
}

/* Цены улучшений как в Scrap Clicker 2: 1,000 · 20,000 · 250,000 · 1.25 M */
function fmtPrice(value) {
  if (!isFinite(value)) return '∞';

  if (Math.abs(value) < 1e6) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  if (Math.abs(value) >= 1e42) return fmt(value);

  const text = fmt(value);
  const match = text.match(/^(-?[\d.]+)([A-Za-z]+)$/);
  if (!match) return text;

  /* убираем нули только в дробной части: 1.25 → 1.25, 1.50 → 1.5, 100 → 100 */
  const num = match[1].includes('.')
    ? match[1].replace(/0+$/, '').replace(/\.$/, '')
    : match[1];
  return num + ' ' + match[2];
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return String(m).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* Осветление / затемнение hex-цвета: amt от -100 до 100 */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const shift = (amt / 100) * 255;
  const f = (v) => clamp(Math.round(v + shift), 0, 255).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}

/* SVG-бочка нужного цвета — объёмная: градиенты, клёпки, обручи, блики и тень */
let __barrelId = 0;
function barrelSVG(color) {
  const n = ++__barrelId;
  const bodyId = 'body' + n;
  const glossId = 'gloss' + n;
  const lidId = 'lid' + n;
  const innerId = 'inner' + n;
  const hoopId = 'hoop' + n;
  const shineId = 'shine' + n;
  const clipId = 'clip' + n;

  const light = shade(color, 34);
  const dark = shade(color, -42);
  const edge = shade(color, -64);
  const deep = shade(color, -78);

  return `
  <svg class="barrel-svg" viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${bodyId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${edge}"/>
        <stop offset="0.06" stop-color="${dark}"/>
        <stop offset="0.16" stop-color="${shade(color, -20)}"/>
        <stop offset="0.29" stop-color="${light}"/>
        <stop offset="0.4" stop-color="${shade(color, 46)}"/>
        <stop offset="0.53" stop-color="${shade(color, 8)}"/>
        <stop offset="0.68" stop-color="${color}"/>
        <stop offset="0.85" stop-color="${dark}"/>
        <stop offset="1" stop-color="${edge}"/>
      </linearGradient>
      <linearGradient id="${glossId}" x1="0.1" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.36"/>
        <stop offset="0.22" stop-color="#ffffff" stop-opacity="0.08"/>
        <stop offset="0.52" stop-color="#000000" stop-opacity="0"/>
        <stop offset="0.84" stop-color="#000000" stop-opacity="0.3"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.52"/>
      </linearGradient>
      <linearGradient id="${shineId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.3"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="${lidId}" cx="0.38" cy="0.28" r="0.9">
        <stop offset="0" stop-color="${shade(color, 28)}"/>
        <stop offset="0.5" stop-color="${shade(color, -20)}"/>
        <stop offset="1" stop-color="${edge}"/>
      </radialGradient>
      <radialGradient id="${innerId}" cx="0.4" cy="0.35" r="0.8">
        <stop offset="0" stop-color="#242d29"/>
        <stop offset="0.65" stop-color="#0b100d"/>
        <stop offset="1" stop-color="#000000"/>
      </radialGradient>
      <linearGradient id="${hoopId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${deep}"/>
        <stop offset="0.14" stop-color="#313a36"/>
        <stop offset="0.36" stop-color="#a7b3ad"/>
        <stop offset="0.52" stop-color="#5b6661"/>
        <stop offset="0.74" stop-color="#39423e"/>
        <stop offset="1" stop-color="#121715"/>
      </linearGradient>
      <clipPath id="${clipId}">
        <path d="M22 16 C7 46 7 104 22 134 L98 134 C113 104 113 46 98 16 Z"/>
      </clipPath>
    </defs>

    <ellipse cx="60" cy="140" rx="38" ry="7.5" fill="#04070d" opacity="0.5"/>
    <ellipse cx="60" cy="133" rx="37" ry="9.5" fill="${edge}" opacity="0.85"/>

    <path d="M22 16 C7 46 7 104 22 134 L98 134 C113 104 113 46 98 16 Z" fill="url(#${bodyId})"/>

    <g clip-path="url(#${clipId})">
      <path d="M22 16 C7 46 7 104 22 134 L98 134 C113 104 113 46 98 16 Z" fill="url(#${glossId})"/>

      <g fill="none" stroke="${edge}" stroke-width="1.4" opacity="0.28">
        <path d="M37 13 C28 48 28 102 37 138"/>
        <path d="M49 12 C45 48 45 102 49 138"/>
        <path d="M61 12 C60 48 60 102 61 138"/>
        <path d="M73 12 C76 48 76 102 73 138"/>
        <path d="M85 13 C93 48 93 102 85 138"/>
      </g>

      <g fill="none" stroke="${light}" stroke-width="0.8" opacity="0.2">
        <path d="M43 16 C36 49 36 101 43 134"/>
        <path d="M55 16 C52 49 52 101 55 134"/>
        <path d="M67 16 C68 49 68 101 67 134"/>
        <path d="M79 16 C85 49 85 101 79 134"/>
      </g>

      <ellipse cx="36" cy="66" rx="11" ry="48" fill="url(#${shineId})" opacity="0.65"/>
      <path d="M91 24 C100 52 100 98 91 126" stroke="#ffffff" stroke-width="2.6" opacity="0.14" fill="none" stroke-linecap="round"/>
    </g>

    <ellipse cx="60" cy="16" rx="38" ry="10.5" fill="url(#${lidId})"/>
    <ellipse cx="60" cy="16" rx="30" ry="7.6" fill="url(#${innerId})"/>
    <ellipse cx="60" cy="16" rx="38" ry="10.5" fill="none" stroke="${light}" stroke-opacity="0.4" stroke-width="1.2"/>
    <path d="M25 12 C34 6 49 4.5 61 5" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1.6" fill="none" stroke-linecap="round"/>

    <g>
      <path d="M10 46 C10 41 110 41 110 46 L110 58 C110 63 10 63 10 58 Z" fill="url(#${hoopId})"/>
      <path d="M11 44.5 C38 41.5 82 41.5 109 44.5" stroke="#eef5f1" stroke-opacity="0.5" stroke-width="1.3" fill="none"/>
      <path d="M11 59.5 C38 62.1 82 62.1 109 59.5" stroke="#000000" stroke-opacity="0.45" stroke-width="1.8" fill="none"/>

      <path d="M11 92 C11 87 109 87 109 92 L109 104 C109 109 11 109 11 104 Z" fill="url(#${hoopId})"/>
      <path d="M12 90.5 C38 87.5 82 87.5 108 90.5" stroke="#eef5f1" stroke-opacity="0.48" stroke-width="1.3" fill="none"/>
      <path d="M12 105.5 C38 108.1 82 108.1 108 105.5" stroke="#000000" stroke-opacity="0.42" stroke-width="1.8" fill="none"/>

      <g>
        <circle cx="21" cy="54" r="2" fill="#202824" stroke="#b9c6c0" stroke-opacity="0.5" stroke-width="0.8"/>
        <circle cx="60" cy="56.2" r="2" fill="#202824" stroke="#b9c6c0" stroke-opacity="0.5" stroke-width="0.8"/>
        <circle cx="99" cy="54" r="2" fill="#202824" stroke="#b9c6c0" stroke-opacity="0.5" stroke-width="0.8"/>
        <circle cx="21" cy="100" r="2" fill="#202824" stroke="#b9c6c0" stroke-opacity="0.5" stroke-width="0.8"/>
        <circle cx="60" cy="102.2" r="2" fill="#202824" stroke="#b9c6c0" stroke-opacity="0.5" stroke-width="0.8"/>
        <circle cx="99" cy="100" r="2" fill="#202824" stroke="#b9c6c0" stroke-opacity="0.5" stroke-width="0.8"/>
      </g>
    </g>

    <path d="M22 133.5 C38 140 82 140 98 133.5" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.4" fill="none"/>
  </svg>`;
}

/* Экспорт для консоли */
window.BC = {
  TIERS, TIER_TOTAL, UPGRADES, MAGNET_UPGRADES, defaultState, loadState, saveState, resetState, resetRun,
  defaultUpgrades, defaultMagnetShop, multiplier, barrelsIncome, perSecond, fieldIncome, fieldCount,
  xpNeeded, xpGain, goldenGain, boostPerGolden, goldenBonusPercent,
  GOLDEN_BLOCK, GOLDEN_BLOCK_BONUS,
  PRESTIGE_BASE, PRESTIGE_STEP, PRESTIGE_GROWTH, prestigeRequirement, prestigeReady,
  upgradeCost, upgradeMaxed, tierSingleCost, tierBulkCost, tierUnlocked,
  magnetUpgradeCost, magnetShopLevel, stormCallCost, STORM_CALL_COST,
  FIELD_COLS, FIELD_ROWS, FIELD_SIZE, fieldSize, BIGGER_MAX, STARS_MAX,
  SPAWN_BASE, SPAWN_STEP, SPAWN_MAX_LEVEL, SPAWN_MIN, spawnInterval, spawnLevel,
  magnetChance, doubleChance, stormInterval, offlineSeconds, spawnTier, raiseFieldBarrels,
  stormMagnetCount, STORM_MAGNET_BASE, STORM_MAGNET_PER_LEVEL,
  fmt, fmtPrice, formatTime, shade, barrelSVG, STORAGE_KEY,
};
