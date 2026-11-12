'use strict';

/* ------------------------------------------------------------------
   Barrel Clicker 2 — игровая логика
------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

/* маленькая заставка: убираем после анимации, чтобы не оставалась в DOM */
const bootSplash = $('bootSplash');
if (bootSplash) window.setTimeout(() => bootSplash.remove(), 1800);

let state = loadState();
let lastFrame = performance.now();
let selectedCell = -1;
let justDragged = 0;
let lastEtaText = '';
/* Таймер «Авто слияния». Не сохраняется: после перезагрузки отсчёт начинается заново. */
let autoMergeTimer = 0;

/* Магнитный шторм: дождь магнитов поверх интерфейса.
   Не сохраняется — это временное событие. */
let stormRain = null;

/* После третьей неверной попытки пароля игра останавливается и закрывается */
let gameStopped = false;

const fieldEl = $('field');
const trashEl = $('trashZone');

/* ---------------------------------- отрисовка ---------------------------------- */

function renderTop() {
  $('scrap').textContent = fmt(state.scrap);
  $('perSecond').textContent = fmt(perSecond(state)) + ' / сек';
  $('totalScrap').textContent = fmt(state.totalScrap);
  $('level').textContent = fmt(state.level || 1);
  $('magnets').textContent = fmt(state.magnets || 0);
  $('goldenScrap').textContent = fmt(state.goldenScrap || 0);
  $('stars').textContent = fmt(state.stars || 0);

  const need = xpNeeded(state.level || 1);
  $('xpText').textContent = fmt(state.xp || 0) + ' / ' + fmt(need);
  $('xpFill').style.width = clamp(((state.xp || 0) / need) * 100, 0, 100) + '%';

  renderStats();
}

function renderStats() {
  $('statTotalScrap').textContent = fmt(state.totalScrap || 0);
  $('statMerges').textContent = fmt(state.merges || 0);
  $('statSpawns').textContent = fmt(state.spawns || 0);
  $('statStorms').textContent = fmt(state.storms || 0);
  $('statRestarts').textContent = fmt(state.restarts || 0);
  $('statMult').textContent = '×' + fmt(multiplier(state));
}

function pulseStat(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

function secText(value) {
  return value.toFixed(1).replace('.', ',') + ' с';
}

/* ---------------------------------- поле слияния ---------------------------------- */

function renderField(anim) {
  fieldEl.innerHTML = state.field.map((cell, i) => {
    if (!cell) return `<div class="cell" data-index="${i}"></div>`;

    const tier = TIERS[cell.tier];
    const maxed = cell.tier === TIERS.length - 1 ? ' max-tier' : '';
    return `<div class="cell has${i === selectedCell ? ' selected' : ''}${maxed}" data-index="${i}">
      ${barrelSVG(tier.color)}
      <span class="cell-level">${cell.tier + 1}</span>
    </div>`;
  }).join('');

  if (anim) {
    const el = fieldEl.children[anim.index];
    if (el) el.classList.add(anim.kind === 'merge' ? 'merge-in' : 'spawn-in');
  }

  $('fieldCount').textContent = fieldCount(state) + ' / ' + fieldSize(state);
  $('fieldBarrels').textContent = fmt(fieldCount(state));
  $('merges').textContent = fmt(state.merges || 0);
  $('fieldIncome').textContent = fmt(fieldIncome(state) * multiplier(state));
  $('spawnTierNow').textContent = spawnTier(state) + 1;

  renderTrash();
}

/* ---------------------------------- мусоропровод ---------------------------------- */

function renderTrash() {
  if (!trashEl) return;
  $('trashCount').textContent = fmt(state.trashed || 0);
  trashEl.classList.toggle('armed', selectedCell >= 0);
}

function pulseTrash() {
  if (!trashEl) return;
  trashEl.classList.remove('bump');
  void trashEl.offsetWidth;
  trashEl.classList.add('bump');
}

function pointerOverTrash(x, y) {
  const el = document.elementFromPoint(x, y);
  return !!(el && el.closest && el.closest('#trashZone'));
}

/* Выбросить бочку из клетки поля */
function discardCell(index) {
  const cell = state.field[index];
  if (!cell) return false;

  state.field[index] = null;
  state.trashed = (state.trashed || 0) + 1;
  selectedCell = -1;

  saveState(state);
  renderField();
  renderTop();
  pulseTrash();

  if (trashEl) {
    const rect = trashEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    spawnFloat('−1 🛢️', rect.left + 34, rect.top + rect.height / 2, 'trash');
    fxBurst(cx, cy, { color: '#9ca3af', count: 14, speed: 2.2, size: 2.6 });
  }

  sfx('trash');
  return true;
}

function spawnOnField(forcedTier) {
  /* строго по порядку: первая свободная клетка слева-сверху */
  const index = state.field.indexOf(null);
  if (index === -1) return -1;

  const tier = typeof forcedTier === 'number'
    ? clamp(Math.floor(forcedTier), 0, TIERS.length - 1)
    : spawnTier(state);

  state.field[index] = { id: state.fieldSeq++, tier };
  state.spawns = (state.spawns || 0) + 1;
  return index;
}

function mergeField(from, to) {
  const a = state.field[from];
  const b = state.field[to];
  if (!a || !b || a.tier !== b.tier) return false;
  if (a.tier >= TIERS.length - 1) return false;

  state.field[to] = { id: b.id, tier: b.tier + 1 };
  state.field[from] = null;
  return true;
}

function moveField(from, to) {
  const tmp = state.field[to];
  state.field[to] = state.field[from];
  state.field[from] = tmp;
}

function gainXp(amount) {
  const before = state.level || 1;

  state.xp = (state.xp || 0) + amount;
  while (state.xp >= xpNeeded(state.level || 1)) {
    state.xp -= xpNeeded(state.level || 1);
    state.level = (state.level || 1) + 1;
  }

  if ((state.level || 1) > before) {
    fxAtEl($('level'), '#ffd166', { count: 26, speed: 3, size: 3, shape: 'star' });
    sfx('level');
  }
}

/* Валюта падает при слиянии: чем больше слияний, тем чаще бонусы */
function dropOnMerge(cellIndex) {
  const mergeNo = state.merges || 1;

  const drop = (key, statId, text, cls, chance, every) => {
    if (mergeNo % every !== 0 && Math.random() >= chance) return;

    state[key] = (state[key] || 0) + 1;
    pulseStat(statId);

    const el = fieldEl.children[cellIndex];
    if (el) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 3;
      spawnFloat(text, cx, cy, cls);
      fxBurst(cx, cy, key === 'magnets'
        ? { color: '#ff8f8f', count: 12, speed: 2.2, size: 2.6, shape: 'star' }
        : { color: '#ffd166', count: 16, speed: 2.5, size: 3, shape: 'star' });
      sfx(key === 'magnets' ? 'magnet' : 'gold');
    }
  };

  drop('magnets', 'magnets', '+1 🧲', 'magnet', 0.08, 12);
  drop('goldenScrap', 'goldenScrap', '+1 🏅', 'gold', 0.04, 25);
}

/* перетаскивание и клики */
function cellIndexFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('.cell') : null;
  return cell ? Number(cell.dataset.index) : -1;
}

function clearDropMarks() {
  fieldEl.querySelectorAll('.drop-ok, .drop-bad').forEach((el) => {
    el.classList.remove('drop-ok', 'drop-bad');
  });
}

function handleDrop(from, to) {
  if (to < 0 || to === from) return false;

  const a = state.field[from];
  const b = state.field[to];
  if (!a) return false;

  if (!b) {
    moveField(from, to);
    selectedCell = -1;
    saveState(state);
    renderField();
    renderTop();
    return true;
  }

  if (a.tier === b.tier && a.tier < TIERS.length - 1) {
    mergeField(from, to);
    state.merges = (state.merges || 0) + 1;
    gainXp(xpGain(state));
    dropOnMerge(to);
    selectedCell = -1;
    saveState(state);
    renderField({ index: to, kind: 'merge' });
    renderTop();
    refreshAffordability();

    const merged = state.field[to];
    if (merged) {
      const tier = TIERS[merged.tier];
      fxAtEl(fieldEl.children[to], tier.color, { count: 24, speed: 3.1, size: 3.2, lift: 0.5 });
      sfx('merge', merged.tier);
    }
    return true;
  }

  /* разные уровни — просто меняем местами */
  moveField(from, to);
  selectedCell = -1;
  saveState(state);
  renderField();
  renderTop();
  return true;
}

fieldEl.addEventListener('pointerdown', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell) return;

  const from = Number(cell.dataset.index);
  const barrel = state.field[from];
  if (!barrel) {
    /* клик по пустой клетке — переносим выбранную */
    if (selectedCell >= 0) handleDrop(selectedCell, from);
    return;
  }

  e.preventDefault();

  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.innerHTML = barrelSVG(TIERS[barrel.tier].color);
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';
  ghost.style.display = 'none';
  document.body.appendChild(ghost);

  let moving = false;
  const startX = e.clientX;
  const startY = e.clientY;

  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!moving && Math.hypot(dx, dy) > 6) {
      moving = true;
      ghost.style.display = 'grid';
      cell.style.opacity = '0.25';
    }

    if (!moving) return;

    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';

    const overTrash = pointerOverTrash(ev.clientX, ev.clientY);
    if (trashEl) trashEl.classList.toggle('over', overTrash);

    clearDropMarks();
    if (overTrash) return;

    const target = cellIndexFromPoint(ev.clientX, ev.clientY);
    if (target >= 0 && target !== from) {
      const targetCell = fieldEl.children[target];
      const other = state.field[target];
      const ok = !other || other.tier === barrel.tier;
      if (targetCell) targetCell.classList.add(ok ? 'drop-ok' : 'drop-bad');
    }
  };

  const onUp = (ev) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    ghost.remove();
    clearDropMarks();
    if (trashEl) trashEl.classList.remove('over');
    cell.style.opacity = '';
    if (!moving) return;

    justDragged = Date.now();

    if (ev.type !== 'pointercancel' && pointerOverTrash(ev.clientX, ev.clientY)) {
      discardCell(from);
      return;
    }

    const target = cellIndexFromPoint(ev.clientX, ev.clientY);
    if (target >= 0) handleDrop(from, target);
    else renderField();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
});

/* клик по бочке: выбрать / слить / снять выбор */
fieldEl.addEventListener('click', (e) => {
  if (Date.now() - justDragged < 300) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;

  const index = Number(cell.dataset.index);
  if (!state.field[index]) return;

  if (selectedCell === -1) {
    selectedCell = index;
    renderField();
    return;
  }

  if (selectedCell === index) {
    selectedCell = -1;
    renderField();
    return;
  }

  handleDrop(selectedCell, index);
});

/* клик по мусоропроводу выбрасывает выбранную бочку */
trashEl.addEventListener('click', () => {
  if (Date.now() - justDragged < 300) return;
  if (selectedCell >= 0) discardCell(selectedCell);
});

function updateEta() {
  const eta = $('spawnEta');
  if (!eta) return;

  if (fieldCount(state) >= fieldSize(state)) {
    if (eta.textContent !== 'поле заполнено') {
      eta.textContent = 'поле заполнено';
      eta.style.color = 'var(--gold)';
      lastEtaText = '';
    }
    return;
  }

  const left = Math.max(0, spawnInterval(state) - state.spawnTimer);
  const text = secText(left);
  if (text !== lastEtaText) {
    lastEtaText = text;
    eta.textContent = text;
    eta.style.color = '';
  }
}

/* ---------------------------------- шторм ---------------------------------- */

function renderStorm() {
  const interval = stormInterval(state);
  const left = Math.max(0, interval - (state.stormTimer || 0));
  const progress = clamp((state.stormTimer || 0) / interval, 0, 1);
  const raining = !!(stormRain && stormRain.active);

  const label = $('stormLabel');
  if (label) label.textContent = raining ? 'Магнитный шторм' : 'Следующий шторм';

  const eta = $('stormEta');
  if (eta) {
    if (raining) {
      eta.textContent = stormRain.caught + ' / ' + stormRain.total;
      eta.classList.add('hot');
    } else {
      eta.textContent = formatTime(left);
      eta.classList.remove('hot');
    }
  }

  const share = raining
    ? (stormRain.total ? stormRain.caught / stormRain.total : 0)
    : progress;
  $('stormFill').style.width = (clamp(share, 0, 1) * 100).toFixed(1) + '%';

  const callBtn = $('stormCall');
  if (callBtn) {
    const cost = stormCallCost(state);
    const text = 'Вызвать · ' + cost + ' 🧲';
    if (callBtn.textContent !== text) callBtn.textContent = text;
    callBtn.disabled = raining || (state.magnets || 0) < cost;
  }
}

/* Сколько длится дождь: 9 с + 0,35 с за уровень «Силы шторма»
   + 0,6 с за уровень «Долгого шторма» из магнитного магазина */
function stormRainDuration(power) {
  const longStorm = 600 * magnetShopLevel(state, 'longStorm');
  return Math.min(20000, 9000 + 350 * power + longStorm);
}

function startStormRain() {
  if (stormRain && stormRain.active) return;

  const power = state.upgrades.stormPower || 0;
  const total = stormMagnetCount(state);
  const duration = stormRainDuration(power);
  const now = performance.now();

  stormRain = {
    active: true,
    startedAt: now,
    endsAt: now + duration,
    nextDrop: now,
    gap: duration / total,
    total,
    dropped: 0,
    caught: 0,
  };

  renderStorm();
}

/* Магнит появляется сверху и падает вниз — по нему надо успеть кликнуть */
function spawnFallingMagnet() {
  const layer = $('stormLayer');
  if (!layer) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'storm-magnet';
  btn.setAttribute('aria-label', 'Поймать магнит');

  const x = 6 + Math.random() * 88;                       // % ширины экрана
  const size = 52 + Math.round(Math.random() * 26);       // 52…78 px
  const fall = (2.6 + Math.random() * 1.6).toFixed(2);    // 2,6…4,2 с
  const drift = Math.round((Math.random() - 0.5) * 140);  // снос в сторону
  const spin = Math.round((Math.random() - 0.5) * 40);

  btn.style.setProperty('--x', x.toFixed(2) + '%');
  btn.style.setProperty('--size', size + 'px');
  btn.style.setProperty('--fall', fall + 's');
  btn.style.setProperty('--drift', drift + 'px');
  btn.style.setProperty('--spin', spin + 'deg');
  btn.innerHTML = '<span class="magnet-ico">🧲</span>';

  btn.addEventListener('click', () => collectMagnet(btn));

  layer.appendChild(btn);
  setTimeout(() => btn.remove(), Number(fall) * 1000 + 400);
}

function stormFloat(text, clientX, clientY) {
  const layer = $('stormLayer');
  if (!layer) return;

  const el = document.createElement('div');
  el.className = 'storm-float';
  el.textContent = text;
  el.style.left = clientX + 'px';
  el.style.top = clientY + 'px';
  layer.appendChild(el);

  setTimeout(() => el.remove(), 750);
}

function collectMagnet(btn) {
  if (!btn || btn.classList.contains('caught')) return;

  btn.classList.add('caught');

  /* «Щедрый улов»: шанс, что магнит даст сразу +2 */
  const double = Math.random() < 0.02 * magnetShopLevel(state, 'catchDouble');
  const gain = double ? 2 : 1;

  state.magnets = (state.magnets || 0) + gain;
  if (stormRain && stormRain.active) stormRain.caught++;
  state.catches = (state.catches || 0) + 1;

  pulseStat('magnets');
  saveState(state);
  renderTop();
  renderStorm();
  refreshAffordability();

  const rect = btn.getBoundingClientRect();
  stormFloat('+' + gain + ' 🧲', rect.left + rect.width / 2, rect.top + rect.height / 2);
  fxBurst(rect.left + rect.width / 2, rect.top + rect.height / 2,
    { color: '#ff8f8f', count: 14, speed: 2.6, size: 2.8, shape: 'star' });
  sfx('magnet');

  setTimeout(() => btn.remove(), 220);
}

function finishStormRain() {
  const caught = stormRain ? stormRain.caught : 0;
  if (stormRain) stormRain.active = false;

  renderStorm();
  refreshAffordability();
  toast('Магнитный шторм закончился: поймано ' + caught + ' 🧲');
}

/* Сброс дождя (перезапуск, загрузка сохранения, смена вкладки) */
function clearStormRain() {
  stormRain = null;
  const layer = $('stormLayer');
  if (layer) layer.innerHTML = '';
  renderStorm();
}

function stormRainTick(now) {
  if (!stormRain || !stormRain.active) return;

  const rain = stormRain;

  /* вкладка была свёрнута — не досыпаем оставшиеся магниты */
  if (now >= rain.endsAt) {
    rain.dropped = rain.total;
    finishStormRain();
    return;
  }

  while (rain.dropped < rain.total && now >= rain.nextDrop) {
    spawnFallingMagnet();
    rain.dropped++;
    rain.nextDrop += rain.gap;
  }
}

/* Разовый бонус шторма: бочки в коллекцию и на поле */
function doStorm() {
  const power = 1 + (state.upgrades.stormPower || 0);
  const tier = spawnTier(state);

  state.barrels[TIERS[tier].id] = (state.barrels[TIERS[tier].id] || 0) + power;
  state.storms = (state.storms || 0) + 1;

  for (let i = 0; i < power; i++) spawnOnField(tier);

  state.spawnTimer = Math.min(state.spawnTimer, spawnInterval(state) * 0.5);
  startStormRain();
  saveState(state);
  updateBarrelCard(TIERS[tier].id);
  renderTop();
  renderField();
  renderStorm();

  sfx('storm');
  fxAtEl($('stormFill'), '#60a5fa', { count: 22, speed: 2.6, size: 2.6, shape: 'star' });
}

function stormTick(dt) {
  const interval = stormInterval(state);
  state.stormTimer = (state.stormTimer || 0) + dt;

  if (state.stormTimer >= interval) {
    state.stormTimer = 0;
    doStorm();
  }

  renderStorm();
}

/* ---------------------------------- улучшения ---------------------------------- */

function upgradeCurrency(key) {
  return UPGRADES[key].currency === 'goldenScrap' ? 'goldenScrap' : 'scrap';
}

function currencyLabel(currency) {
  return currency === 'goldenScrap' ? '🏅' : 'скрап';
}

function nextSpawnInterval(level) {
  return Math.max(SPAWN_MIN, SPAWN_BASE - SPAWN_STEP * Math.min(SPAWN_MAX_LEVEL, level));
}

function upgradeEffect(key) {
  const level = state.upgrades[key] || 0;
  const next = Math.min(UPGRADES[key].max, level + 1);

  switch (key) {
    case 'spawn': {
      if (level >= SPAWN_MAX_LEVEL) return 'максимум: ' + secText(spawnInterval(state));
      return secText(spawnInterval(state)) + ' → ' + secText(nextSpawnInterval(next));
    }
    case 'level': {
      if (level >= UPGRADES.level.max) return 'максимум: ' + TIERS.length + '-й уровень';
      return (level + 1) + '-й уровень → ' + (next + 1) + '-й уровень';
    }
    case 'magnet':
      return Math.round(magnetChance(state) * 100) + '% → ' + Math.min(50, next * 2) + '% шанс';
    case 'double':
      return Math.round(doubleChance(state) * 100) + '% → ' + Math.min(25, next) + '% шанс';
    case 'levelSpeed':
      return '+' + level * 10 + '% → +' + next * 10 + '% опыта';
    case 'offline':
      return (offlineSeconds(state) / 3600).toFixed(1).replace('.', ',') + ' ч → '
        + (2 + next * 0.5).toFixed(1).replace('.', ',') + ' ч';
    case 'stormTime':
      return formatTime(stormInterval(state)) + ' → '
        + formatTime(Math.max(60, 300 * Math.pow(0.9, next)));
    case 'stormPower':
      return '+' + (1 + level) + ' → +' + (1 + next) + ' бочек · '
        + (STORM_MAGNET_BASE + STORM_MAGNET_PER_LEVEL * level) + ' → '
        + (STORM_MAGNET_BASE + STORM_MAGNET_PER_LEVEL * next) + ' 🧲';
    case 'goldenChance':
      return '+' + level * 5 + '% → +' + next * 5 + '% золотого скрапа';
    case 'boost':
      return '+' + Math.round(goldenBonusPercent(state) * 100) + '% → +'
        + Math.round((GOLDEN_BLOCK_BONUS + 0.01 * next) * 100) + '% за 100 🏅';
    case 'bigger': {
      const cells = fieldSize(state);
      if (level >= UPGRADES.bigger.max) return 'максимум: ' + cells + ' клеток поля';
      return cells + ' → ' + (cells + 1) + ' клеток поля';
    }
    case 'autoMerge': {
      if (level >= UPGRADES.autoMerge.max) return 'максимум: каждые 6 с';
      const now = level > 0 ? autoMergeInterval(state) : 0;
      return (now ? 'каждые ' + now + ' с → ' : 'каждые ') + (11 - next) + ' с';
    }
    default:
      return '';
  }
}

function renderUpgrades() {
  const box = $('upgradeGrid');
  let total = 0;
  let maxTotal = 0;

  box.innerHTML = Object.entries(UPGRADES).map(([key, u]) => {
    const level = state.upgrades[key] || 0;
    const currency = upgradeCurrency(key);
    const maxed = level >= u.max;
    const cost = maxed ? 0 : upgradeCost(key, level);
    const affordable = maxed || (state[currency] || 0) >= cost;

    total += level;
    maxTotal += u.max;

    return `
      <div class="upgrade-card color-${u.color}${maxed ? ' maxed' : ''}">
        <div class="upgrade-top">
          <div class="upgrade-icon">${u.icon}</div>
          <div class="upgrade-title">
            <b>${u.name}</b>
            <span>уровень ${level} / ${u.max}</span>
          </div>
        </div>
        <p class="upgrade-desc">${u.desc}</p>
        <div class="upgrade-effect">${maxed ? 'максимум' : upgradeEffect(key)}</div>
        <button class="upgrade-buy" data-action="upgrade" data-key="${key}"
                data-cost="${cost}" data-currency="${currency}" data-maxed="${maxed ? 1 : 0}"
                ${affordable ? '' : 'disabled'}>
          ${maxed ? 'МАКС' : fmtPrice(cost) + ' <small>' + currencyLabel(currency) + '</small>'}
        </button>
      </div>`;
  }).join('');

  $('upgradeSummary').textContent = total + ' / ' + maxTotal + ' улучшений';
}

/* ---------------------------------- магнитный магазин ---------------------------------- */

function magnetShopEffect(key) {
  const level = magnetShopLevel(state, key);
  const next = Math.min(MAGNET_UPGRADES[key].max, level + 1);

  switch (key) {
    case 'grip':
      return '+' + level + '% → +' + next + '% шанс магнита';
    case 'economy': {
      const now = stormCallCost(state);
      const then = Math.max(5, STORM_CALL_COST - next);
      return now + ' 🧲 → ' + then + ' 🧲 за вызов';
    }
    case 'longStorm': {
      const step = (value) => (value * 0.6).toFixed(1).replace('.', ',');
      return '+' + step(level) + ' с → +' + step(next) + ' с';
    }
    case 'catchDouble':
      return level * 2 + '% → ' + next * 2 + '% шанс ×2';
    case 'warm':
      return level * 4 + ' мин → ' + next * 4 + ' мин';
    default:
      return '';
  }
}

function renderMagnetShop() {
  const box = $('magnetGrid');
  if (!box) return;

  let total = 0;
  let maxTotal = 0;

  box.innerHTML = Object.entries(MAGNET_UPGRADES).map(([key, u]) => {
    const level = magnetShopLevel(state, key);
    const maxed = level >= u.max;
    const cost = maxed ? 0 : magnetUpgradeCost(key, level);
    const affordable = maxed || (state.magnets || 0) >= cost;

    total += level;
    maxTotal += u.max;

    return `
      <div class="upgrade-card color-${u.color}${maxed ? ' maxed' : ''}">
        <div class="upgrade-top">
          <div class="upgrade-icon">${u.icon}</div>
          <div class="upgrade-title">
            <b>${u.name}</b>
            <span>уровень ${level} / ${u.max}</span>
          </div>
        </div>
        <p class="upgrade-desc">${u.desc}</p>
        <div class="upgrade-effect">${maxed ? 'максимум' : magnetShopEffect(key)}</div>
        <button class="upgrade-buy" data-action="magnet" data-key="${key}"
                data-cost="${cost}" data-maxed="${maxed ? 1 : 0}" data-currency="magnets"
                ${affordable ? '' : 'disabled'}>
          ${maxed ? 'МАКС' : fmtPrice(cost) + ' <small>🧲</small>'}
        </button>
      </div>`;
  }).join('');

  $('magnetSummary').textContent = total + ' / ' + maxTotal;
  $('magnetBalance').textContent = fmt(state.magnets || 0);
}

/* ---------------------------------- бочки ---------------------------------- */

function barrelCardHTML(t, index) {
  const owned = state.barrels[t.id] || 0;
  const one = tierSingleCost(t, owned);
  const ten = tierBulkCost(t, owned, 10);
  const unlocked = tierUnlocked(state, index);
  const affordable = unlocked && state.scrap >= one;

  return `
      <div class="barrel-card${unlocked ? '' : ' locked'}" data-barrel="${t.id}">
        <div class="barrel-ico">
          ${barrelSVG(t.color)}
          <button class="barrel-eye" data-inspect="${t.id}" type="button"
                  aria-label="Осмотреть бочку «${t.name}»" title="Осмотреть бочку">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.2 12S5.9 5.5 12 5.5 21.8 12 21.8 12 18.1 18.5 12 18.5 2.2 12 2.2 12Z"
                    fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="1.8"/>
            </svg>
          </button>
        </div>
        <div class="barrel-info">
          <b>${t.name}</b>
          <span>${t.desc}</span>
          <span class="owned">${fmt(owned)} шт. · +${fmt(t.income * multiplier(state))}/сек</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;flex:0 0 auto">
          <button class="barrel-buy" data-action="barrel" data-tier="${t.id}" data-count="1"
                  data-cost="${one}" data-locked="${unlocked ? 0 : 1}"
                  ${affordable ? '' : 'disabled'}>
            ${fmt(one)}<small>×1</small>
          </button>
          <button class="barrel-buy" data-action="barrel" data-tier="${t.id}" data-count="10"
                  data-cost="${ten}" data-locked="${unlocked ? 0 : 1}"
                  ${unlocked && state.scrap >= ten ? '' : 'disabled'}>
            ${fmt(ten)}<small>×10</small>
          </button>
        </div>
      </div>`;
}

function updateUnlockedCount() {
  let known = 0;
  for (let index = 0; index < TIERS.length; index++) {
    if (tierUnlocked(state, index)) known++;
  }
  $('unlockedBarrels').textContent = 'Открыто: ' + known + ' / ' + TIERS.length;
}

function renderBarrels() {
  $('barrelGrid').innerHTML = TIERS.map((t, index) => barrelCardHTML(t, index)).join('');
  updateUnlockedCount();
}

/* Точечное обновление одной карточки: не перерисовываем все 512 при покупке */
function updateBarrelCard(tierId) {
  const box = $('barrelGrid');
  if (!box) return;

  const tier = TIERS.find((t) => t.id === tierId);
  if (!tier) return;

  const index = TIERS.indexOf(tier);
  const card = box.querySelector('.barrel-card[data-barrel="' + tierId + '"]');
  if (card) card.outerHTML = barrelCardHTML(tier, index);

  const next = TIERS[index + 1];
  if (next) {
    const nextCard = box.querySelector('.barrel-card[data-barrel="' + next.id + '"]');
    if (nextCard) nextCard.outerHTML = barrelCardHTML(next, index + 1);
  }

  updateUnlockedCount();
}

/* ---------------------------------- престиж ---------------------------------- */

function renderPrestige() {
  const golden = state.goldenScrap || 0;
  const stars = Math.min(STARS_MAX, state.stars || 0);
  const gain = goldenGain(state);
  const need = prestigeRequirement(state);
  const total = state.totalScrap || 0;
  const ready = total >= need;
  const nextGold = golden + gain;
  const nextStars = Math.min(STARS_MAX, stars + 1);
  const nextMult = (1 + nextGold * boostPerGolden(state))
    * (1 + 0.10 * nextStars);

  $('prestigeLevel').textContent = state.level || 1;
  $('prestigeGolden').textContent = fmt(golden);
  $('prestigeNeed').textContent = fmtPrice(need);
  $('prestigeProgress').textContent = ready
    ? 'готово · ' + fmtPrice(total)
    : fmtPrice(total) + ' / ' + fmtPrice(need);
  $('prestigeGain').textContent = '+' + fmt(gain) + ' 🏅';
  $('prestigePerGolden').textContent = Math.round(goldenBonusPercent(state) * 100) + '%';
  $('prestigeBoost').textContent = '×' + fmt(multiplier(state));
  $('prestigeNextBoost').textContent = '×' + fmt(nextMult);
  $('prestigeBtn').disabled = !ready;
  $('prestigeBtn').textContent = ready
    ? 'Перезапустить игру'
    : 'Нужно ' + fmtPrice(need) + ' скрапа за забег';

  $('starsCount').textContent = stars + ' / ' + STARS_MAX;
  $('starBoost').textContent = '+' + stars * 10 + '%';
  $('starRow').innerHTML = Array.from({ length: STARS_MAX }, (_, i) =>
    `<span class="star${i < stars ? ' on' : ''}">⭐</span>`
  ).join('');
}

/* ---------------------------------- магазин ---------------------------------- */

function renderShop() {
  renderUpgrades();
  renderMagnetShop();
  renderBarrels();
  renderPrestige();
  refreshAffordability();
}

function refreshAffordability() {
  document.querySelectorAll('#upgradeGrid .upgrade-buy').forEach((btn) => {
    if (btn.dataset.maxed === '1') {
      btn.disabled = true;
      return;
    }
    const cost = Number(btn.dataset.cost);
    btn.disabled = !((state[btn.dataset.currency] || 0) >= cost);
  });

  document.querySelectorAll('#barrelGrid .barrel-buy').forEach((btn) => {
    if (btn.dataset.locked === '1') {
      btn.disabled = true;
      return;
    }
    const cost = Number(btn.dataset.cost);
    btn.disabled = !((state.scrap || 0) >= cost);
  });

  document.querySelectorAll('#magnetGrid .upgrade-buy').forEach((btn) => {
    if (btn.dataset.maxed === '1') {
      btn.disabled = true;
      return;
    }
    const cost = Number(btn.dataset.cost);
    btn.disabled = !((state.magnets || 0) >= cost);
  });

  const prestigeBtn = $('prestigeBtn');
  if (prestigeBtn) prestigeBtn.disabled = !prestigeReady(state);

  const stormBtn = $('stormCall');
  if (stormBtn) stormBtn.disabled = !!(stormRain && stormRain.active) || (state.magnets || 0) < stormCallCost(state);
}

/* ---------------------------------- действия ---------------------------------- */

function spendCurrency(currency, amount) {
  if ((state[currency] || 0) < amount) return false;
  state[currency] -= amount;
  return true;
}

function gainScrap(amount) {
  state.scrap += amount;
  state.totalScrap += amount;
}

function buyUpgrade(key) {
  const u = UPGRADES[key];
  if (!u) return;

  const level = state.upgrades[key] || 0;
  if (level >= u.max) return;

  const currency = upgradeCurrency(key);
  const cost = upgradeCost(key, level);
  if (!spendCurrency(currency, cost)) return;

  const oldSpawnTier = spawnTier(state);
  state.upgrades[key] = level + 1;

  /* «Больше — лучше»: сразу добавляем новую клетку в конец поля */
  if (key === 'bigger') state.field.push(null);

  /* «Стартовый уровень»: бочки прошлого уровня на поле сразу становятся нового */
  const raised = key === 'level' ? raiseFieldBarrels(state, oldSpawnTier, spawnTier(state)) : [];

  saveState(state);
  renderTop();
  renderUpgrades();
  renderField();

  /* «Стартовый уровень» открывает новые бочки в магазине, «Усиление» меняет их доход.
     При удержании кнопки не перерисовываем 512 карточек на каждую покупку. */
  if (key === 'level' || key === 'boost') {
    if (holdBuy) holdNeedsBarrels = true;
    else renderBarrels();
  }

  for (const index of raised) {
    const el = fieldEl.children[index];
    if (el) el.classList.add('merge-in');
  }

  sfx('buy');
}

function buyMagnetUpgrade(key) {
  const u = MAGNET_UPGRADES[key];
  if (!u) return;

  const level = magnetShopLevel(state, key);
  if (level >= u.max) return;

  const cost = magnetUpgradeCost(key, level);
  if ((state.magnets || 0) < cost) return;

  state.magnets -= cost;
  state.magnetShop[key] = level + 1;

  saveState(state);
  renderTop();
  renderMagnetShop();
  refreshAffordability();
  sfx('buy');
}

function buyBarrel(tierId, count) {
  const tier = TIERS.find((t) => t.id === tierId);
  if (!tier) return;

  const owned = state.barrels[tier.id] || 0;
  const cost = tierBulkCost(tier, owned, count);
  if (!spendCurrency('scrap', cost)) return;

  state.barrels[tier.id] = owned + count;
  saveState(state);
  renderTop();
  updateBarrelCard(tier.id);
  sfx('buy');
}

function callStorm() {
  if (stormRain && stormRain.active) return;

  const cost = stormCallCost(state);
  if ((state.magnets || 0) < cost) return;

  state.magnets -= cost;
  doStorm();
  renderTop();
  refreshAffordability();
}

function prestigeRun() {
  const need = prestigeRequirement(state);
  if ((state.totalScrap || 0) < need) {
    toast('Для перезапуска нужно ' + fmtPrice(need) + ' скрапа за забег', 'bad');
    return;
  }

  const gain = goldenGain(state);
  if (gain <= 0) return;
  if (!confirm('Перезапустить игру и получить +' + fmt(gain) + ' золотого скрапа?')) return;

  state.goldenScrap = (state.goldenScrap || 0) + gain;
  state.stars = Math.min(STARS_MAX, (state.stars || 0) + 1);
  state.restarts = (state.restarts || 0) + 1;
  resetRun(state);

  selectedCell = -1;
  lastEtaText = '';
  clearStormRain();
  saveState(state);
  renderAll();
  toast('Перезапуск ' + state.restarts + ': +' + fmt(gain) + ' 🏅 (следующий — с '
    + fmtPrice(prestigeRequirement(state)) + ')');

  fxConfetti();
  sfx('prestige');
}

/* ---------------------------------- эффекты: частицы и звук ---------------------------------- */

const fxCanvas = $('fxCanvas');
const fxCtx = fxCanvas ? fxCanvas.getContext('2d') : null;

let fxParticles = [];
let fxRunning = false;
let fxDpr = 1;
let lastBuySound = 0;

/* Звук — короткие синтезированные сигналы, без внешних файлов */
let audioCtx = null;
let soundOn = localStorage.getItem('bc.sound') !== '0';

function ensureAudio() {
  if (!soundOn) return null;

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AC();
    } catch (err) {
      return null;
    }
  }

  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq, dur, opt) {
  const ctx = ensureAudio();
  if (!ctx) return;

  const o = opt || {};
  const t0 = ctx.currentTime + (o.delay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);

  const vol = o.gain || 0.05;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function sfx(kind, param) {
  if (!soundOn) return;

  switch (kind) {
    case 'merge': {
      const base = 300 + Math.min(16, param || 0) * 24;
      tone(base, 0.12, { type: 'triangle', gain: 0.07 });
      tone(base * 1.5, 0.16, { type: 'sine', gain: 0.04, delay: 0.02 });
      break;
    }
    case 'buy': {
      const now = performance.now();
      if (now - lastBuySound < 110) return;
      lastBuySound = now;
      tone(680, 0.045, { type: 'square', gain: 0.02 });
      break;
    }
    case 'magnet':
      tone(920, 0.08, { type: 'sine', gain: 0.05 });
      tone(1380, 0.12, { type: 'sine', gain: 0.04, delay: 0.05 });
      break;
    case 'gold':
      tone(1046, 0.1, { type: 'triangle', gain: 0.05 });
      tone(1568, 0.18, { type: 'sine', gain: 0.04, delay: 0.06 });
      break;
    case 'storm':
      tone(160, 0.55, { type: 'sawtooth', gain: 0.035, to: 560 });
      break;
    case 'trash':
      tone(170, 0.18, { type: 'sawtooth', gain: 0.03, to: 70 });
      break;
    case 'level':
      [523, 659, 784, 1046].forEach((f, i) =>
        tone(f, 0.18, { type: 'triangle', gain: 0.045, delay: i * 0.07 }));
      break;
    case 'prestige':
      [523, 659, 784, 1046, 1318].forEach((f, i) =>
        tone(f, 0.36, { type: 'triangle', gain: 0.05, delay: i * 0.09 }));
      break;
    default:
      tone(420, 0.04, { type: 'sine', gain: 0.025 });
  }
}

function renderSoundButton() {
  const btn = $('soundBtn');
  if (!btn) return;

  btn.textContent = soundOn ? '🔊' : '🔇';
  btn.title = soundOn ? 'Звук включён' : 'Звук выключен';
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('muted', !soundOn);
}

if ($('soundBtn')) {
  renderSoundButton();

  $('soundBtn').addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('bc.sound', soundOn ? '1' : '0');
    renderSoundButton();

    if (soundOn) {
      ensureAudio();
      tone(660, 0.08, { type: 'sine', gain: 0.05 });
    }
  });
}

/* браузер разрешает звук только после первого действия пользователя */
window.addEventListener('pointerdown', () => {
  if (soundOn) ensureAudio();
}, { once: true });

function fxResize() {
  if (!fxCanvas) return;

  fxDpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  fxCanvas.width = Math.floor(window.innerWidth * fxDpr);
  fxCanvas.height = Math.floor(window.innerHeight * fxDpr);
}

function fxStart() {
  if (!fxCtx || fxRunning) return;
  fxRunning = true;
  requestAnimationFrame(fxTick);
}

function fxTick() {
  if (!fxCtx) {
    fxRunning = false;
    return;
  }

  fxCtx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
  fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const alive = [];

  for (const p of fxParticles) {
    p.vy += p.gravity;
    p.vx *= 0.992;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.spin;
    p.life -= p.decay;

    if (p.life <= 0) continue;
    if (p.y > window.innerHeight + 60 || p.x < -80 || p.x > window.innerWidth + 80) continue;

    fxCtx.globalAlpha = Math.max(0, Math.min(1, p.life));
    fxCtx.fillStyle = p.color;

    if (p.shape === 'rect') {
      fxCtx.save();
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rot);
      fxCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      fxCtx.restore();
    } else if (p.shape === 'star') {
      fxCtx.save();
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rot);
      fxCtx.beginPath();
      for (let k = 0; k < 8; k++) {
        const r = k % 2 ? p.size * 0.42 : p.size;
        const a = k * Math.PI / 4;
        fxCtx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      fxCtx.closePath();
      fxCtx.fill();
      fxCtx.restore();
    } else {
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      fxCtx.fill();
    }

    alive.push(p);
  }

  fxCtx.globalAlpha = 1;
  fxParticles = alive;

  if (alive.length) requestAnimationFrame(fxTick);
  else {
    fxRunning = false;
    fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

function fxBurst(x, y, opts) {
  if (!fxCtx) return;

  const o = opts || {};
  const count = o.count || 18;
  const color = o.color || '#ffd166';
  const spread = o.spread != null ? o.spread : Math.PI * 2;
  const angle0 = o.angle != null ? o.angle : Math.random() * Math.PI * 2;

  for (let i = 0; i < count; i++) {
    const angle = o.angle != null
      ? angle0 + (Math.random() - 0.5) * spread
      : Math.random() * Math.PI * 2;
    const speed = (o.speed || 2.4) * (0.45 + Math.random() * 0.9);

    fxParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (o.lift || 0),
      gravity: o.gravity != null ? o.gravity : 0.045,
      life: 1,
      decay: o.decay || 0.018 + Math.random() * 0.014,
      size: (o.size || 3) * (0.6 + Math.random() * 0.8),
      color: i % 6 === 0 ? '#ffffff' : color,
      shape: o.shape || 'circle',
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.25,
    });
  }

  if (fxParticles.length > 700) fxParticles.splice(0, fxParticles.length - 700);
  fxStart();
}

function fxAtEl(el, color, opts) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  fxBurst(rect.left + rect.width / 2, rect.top + rect.height / 2,
    Object.assign({ color }, opts || {}));
}

function fxConfetti() {
  if (!fxCtx) return;

  const colors = ['#ffd166', '#4ade80', '#60a5fa', '#f87171', '#a78bfa', '#ffffff'];

  for (let i = 0; i < 140; i++) {
    fxParticles.push({
      x: Math.random() * window.innerWidth,
      y: -10 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 1.6 + Math.random() * 2.2,
      gravity: 0.016,
      life: 1,
      decay: 0.003 + Math.random() * 0.002,
      size: 6 + Math.random() * 6,
      color: colors[i % colors.length],
      shape: 'rect',
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
    });
  }

  if (fxParticles.length > 700) fxParticles.splice(0, fxParticles.length - 700);
  fxStart();
}

if (fxCanvas) {
  fxResize();
  window.addEventListener('resize', fxResize);
}

/* ---------------------------------- визуал ---------------------------------- */

function spawnFloat(text, clientX, clientY, cls) {
  const layer = $('floatLayer');
  const rect = layer.getBoundingClientRect();

  const x = (clientX ?? rect.left + rect.width / 2) - rect.left;
  const y = (clientY ?? rect.top + rect.height / 2) - rect.top;

  const el = document.createElement('div');
  el.className = 'float-num' + (cls ? ' ' + cls : '');
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  layer.appendChild(el);

  setTimeout(() => el.remove(), 900);
}

function toast(text, kind) {
  const wrap = $('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, 2200);
}

/* ---------------------------------- игровой цикл ---------------------------------- */

let lastAffordability = 0;

function tick(now) {
  if (gameStopped) return;

  const dt = Math.min((now - lastFrame) / 1000, 1);
  lastFrame = now;

  const income = perSecond(state) * dt;
  if (income > 0) {
    gainScrap(income);
    $('scrap').textContent = fmt(state.scrap);
    $('totalScrap').textContent = fmt(state.totalScrap);
  }

  spawnTick(dt);
  autoMergeTick(dt);
  stormTick(dt);
  stormRainTick(now);

  if (now - lastAffordability > 400) {
    lastAffordability = now;
    refreshAffordability();
  }

  requestAnimationFrame(tick);
}

function spawnTick(dt) {
  const interval = spawnInterval(state);

  if (fieldCount(state) >= fieldSize(state)) {
    state.spawnTimer = 0;
    updateEta();
    return;
  }

  state.spawnTimer += dt;

  if (state.spawnTimer >= interval) {
    state.spawnTimer = 0;

    const index = spawnOnField();
    if (index >= 0) {
      renderField({ index, kind: 'spawn' });
      renderTop();
      renderStorm();
      saveState(state);
    }

    if (Math.random() < magnetChance(state)) {
      state.magnets = (state.magnets || 0) + 1;
      pulseStat('magnets');
      renderTop();
    }

    if (Math.random() < doubleChance(state)) {
      const extra = spawnOnField();
      if (extra >= 0) {
        renderField({ index: extra, kind: 'spawn' });
        renderTop();
      }
    }
  }

  updateEta();
}

/* «Авто слияние»: раз в N секунд сливает две одинаковые бочки.
   Выбирается самый низкий уровень, у которого есть пара. */
function findAutoMergePair() {
  const byTier = new Map();

  for (let i = 0; i < state.field.length; i++) {
    const cell = state.field[i];
    if (!cell || cell.tier >= TIERS.length - 1) continue;
    const list = byTier.get(cell.tier);
    if (list) list.push(i);
    else byTier.set(cell.tier, [i]);
  }

  let best = null;
  for (const [tier, cells] of byTier) {
    if (cells.length < 2) continue;
    if (!best || tier < best.tier) best = { tier, from: cells[0], to: cells[1] };
  }
  return best;
}

function autoMergeTick(dt) {
  const interval = autoMergeInterval(state);
  if (!interval) {
    autoMergeTimer = 0;
    return;
  }

  autoMergeTimer += dt;
  if (autoMergeTimer < interval) return;
  autoMergeTimer = 0;

  const pair = findAutoMergePair();
  if (pair) handleDrop(pair.from, pair.to);
}

/* ---------------------------------- сохранение ---------------------------------- */

setInterval(() => { if (!gameStopped) saveState(state); }, 3000);
window.addEventListener('beforeunload', () => saveState(state));

window.addEventListener('storage', (e) => {
  if (gameStopped || e.key !== STORAGE_KEY) return;
  state = loadState();
  selectedCell = -1;
  lastEtaText = '';
  clearStormRain();
  renderAll();
});

/* ---------------------------------- вкладки и «Ещё» ---------------------------------- */

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('hidden', view.id !== 'view-' + name);
  });

  document.querySelectorAll('.bottom-nav button[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
}

document.querySelectorAll('.bottom-nav button[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

const moreSheet = $('moreSheet');

function openMore() {
  moreSheet.hidden = false;
}

function closeMore() {
  moreSheet.hidden = true;
}

$('moreBtn').addEventListener('click', openMore);
$('moreBtn2').addEventListener('click', openMore);
$('sheetClose').addEventListener('click', closeMore);

moreSheet.addEventListener('click', (e) => {
  if (e.target === moreSheet) closeMore();
});

document.querySelectorAll('.sheet-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sheet-tabs button').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    document.querySelectorAll('.sheet-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.id !== 'sheet-' + btn.dataset.sheet);
    });
  });
});

/* ---------------------------------- установка на телефон (PWA) ---------------------------------- */

const installCard = $('installCard');
const installBtn = $('installBtn');
const installSteps = $('installSteps');
const installState = $('installState');

const standaloneMode =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const userAgent = navigator.userAgent || '';
const isIOS =
  /iPad|iPhone|iPod/.test(userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(userAgent);

let installPrompt = null;

if (installCard && !standaloneMode) {
  if (isIOS) {
    installCard.hidden = false;
    installSteps.hidden = false;
    installState.textContent = 'Safari: «Поделиться» → «На экран „Домой“»';
  } else if (isAndroid) {
    installCard.hidden = false;
    installState.textContent = 'Добавь игру на домашний экран — откроется без браузера';
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;

  if (!installCard || standaloneMode || isIOS) return;
  installCard.hidden = false;
  installBtn.hidden = false;
  installSteps.hidden = true;
  installState.textContent = 'Ярлык на домашнем экране, без адресной строки';
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);

    installPrompt = null;
    installBtn.disabled = false;
    installBtn.hidden = true;

    if (choice && choice.outcome === 'accepted') {
      installCard.hidden = true;
      toast('Игра установлена на домашний экран', 'good');
    }
  });
}

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  if (installCard) installCard.hidden = true;
  toast('Barrel Clicker установлен', 'good');
});

/* Service worker нужен только на настоящем хостинге:
   в exe (barrelclicker.local) и на localhost он может закэшировать старые файлы */
const swHost = location.hostname;
const swAllowed =
  'serviceWorker' in navigator &&
  /^https?:$/.test(location.protocol) &&
  swHost !== 'localhost' &&
  swHost !== '127.0.0.1' &&
  swHost !== 'barrelclicker.local';

if (swAllowed) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ---------------------------------- покупки ---------------------------------- */

/* Удержание кнопки покупки: первая покупка сразу, затем авто-повтор */
const HOLD_DELAY = 280;   // мс до начала быстрой прокачки
const HOLD_STEP = 85;     // мс между покупками

let holdBuy = null;
let holdNeedsBarrels = false;
let suppressBuyClick = 0;

function buyPayload(btn) {
  const action = btn.dataset.action;
  if (action === 'upgrade') return { kind: 'upgrade', key: btn.dataset.key };
  if (action === 'magnet') return { kind: 'magnet', key: btn.dataset.key };
  if (action === 'barrel') {
    return { kind: 'barrel', tier: btn.dataset.tier, count: Number(btn.dataset.count) || 1 };
  }
  return null;
}

function runBuy(payload) {
  if (payload.kind === 'upgrade') buyUpgrade(payload.key);
  else if (payload.kind === 'magnet') buyMagnetUpgrade(payload.key);
  else buyBarrel(payload.tier, payload.count);
}

function canBuyAgain(payload) {
  if (payload.kind === 'magnet') {
    const u = MAGNET_UPGRADES[payload.key];
    if (!u) return false;

    const level = magnetShopLevel(state, payload.key);
    if (level >= u.max) return false;

    return (state.magnets || 0) >= magnetUpgradeCost(payload.key, level);
  }

  if (payload.kind === 'upgrade') {
    const u = UPGRADES[payload.key];
    if (!u) return false;

    const level = state.upgrades[payload.key] || 0;
    if (level >= u.max) return false;

    const currency = upgradeCurrency(payload.key);
    return (state[currency] || 0) >= upgradeCost(payload.key, level);
  }

  const tier = TIERS.find((t) => t.id === payload.tier);
  if (!tier) return false;

  const index = TIERS.indexOf(tier);
  if (!tierUnlocked(state, index)) return false;

  const owned = state.barrels[tier.id] || 0;
  return (state.scrap || 0) >= tierBulkCost(tier, owned, payload.count);
}

function stopHoldBuy() {
  /* клик, который браузер дошлёт после pointerup, уже не нужен:
     покупка всегда начинается с pointerdown */
  suppressBuyClick = performance.now() + 400;

  if (!holdBuy) return;

  clearTimeout(holdBuy.timer);
  clearInterval(holdBuy.interval);
  if (holdBuy.btn) holdBuy.btn.classList.remove('holding');
  holdBuy = null;

  /* отложенная перерисовка магазина после серии покупок */
  if (holdNeedsBarrels) {
    holdNeedsBarrels = false;
    renderBarrels();
  }

  refreshAffordability();
}

function startHoldBuy(btn) {
  const payload = buyPayload(btn);
  if (!payload) return;

  stopHoldBuy();

  holdBuy = Object.assign({}, payload, { btn, timer: 0, interval: 0 });
  suppressBuyClick = performance.now() + 400;

  btn.classList.add('holding');
  runBuy(payload);

  holdBuy.timer = setTimeout(() => {
    if (!holdBuy) return;

    holdBuy.interval = setInterval(() => {
      if (!holdBuy) return;

      if (!canBuyAgain(payload)) {
        stopHoldBuy();
        return;
      }

      runBuy(payload);
    }, HOLD_STEP);
  }, HOLD_DELAY);
}

const viewsEl = document.querySelector('.views');

viewsEl.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  const btn = e.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;

  startHoldBuy(btn);
});

viewsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;

  /* клик после pointerdown уже обработан — не покупаем второй раз */
  if (performance.now() < suppressBuyClick) return;

  runBuy(buyPayload(btn));
});

window.addEventListener('pointerup', stopHoldBuy);
window.addEventListener('pointercancel', stopHoldBuy);
window.addEventListener('blur', stopHoldBuy);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopHoldBuy();
});

/* ---------------------------------- осмотр бочки ---------------------------------- */

const inspectSheet = $('barrelInspect');
let inspectIndex = -1;

/* ---------------------------------- 3D-бочка в окне осмотра ---------------------------------- */

const INSPECT_TAU = Math.PI * 2;

const INSPECT3D_VIEW = {
  segments: 48,
  rings: 18,
  height: 170,
  rTop: 42,
  rMid: 62,
  camDist: 560,
  focal: 560,
  scale: 2.05,
  light: (() => {
    const v = [-0.42, 0.72, 0.55];
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  })(),
};

/* металлические обручи: доли высоты бочки от низа */
const INSPECT_HOOPS = [
  { t0: 0.27, t1: 0.39 },
  { t0: 0.58, t1: 0.69 },
];

function inspect3dRadius(t) {
  return INSPECT3D_VIEW.rTop
    + (INSPECT3D_VIEW.rMid - INSPECT3D_VIEW.rTop) * Math.sin(Math.PI * t);
}

/* сетка бочки: кольца по высоте и клёпки по кругу */
const inspect3dMesh = (() => {
  const { segments, rings, height } = INSPECT3D_VIEW;
  const verts = [];
  const faces = [];

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = (t - 0.5) * height;
    const r = inspect3dRadius(t);

    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * INSPECT_TAU;
      verts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
  }

  for (let i = 0; i < rings; i++) {
    const tm = (i + 0.5) / rings;
    const metal = INSPECT_HOOPS.some((h) => tm > h.t0 && tm < h.t1);

    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      faces.push({
        v: [
          i * segments + j,
          (i + 1) * segments + j,
          (i + 1) * segments + j2,
          i * segments + j2,
        ],
        metal,
        stave: j,
      });
    }
  }

  return { verts, faces };
})();

const inspect3d = {
  canvas: $('inspectCanvas'),
  art: $('inspectArt'),
  ctx: null,
  color: '#b07a3c',
  yaw: -0.5,
  pitch: 0.16,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  velYaw: 0,
  velPitch: 0,
  raf: 0,
};

function inspect3dRotate(x, y, z, cy, sy, cp, sp) {
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  return [x1, y2, z2];
}

function inspect3dHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function inspect3dMix(a, b, amount) {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

function inspect3dCss(r, g, b) {
  return 'rgb(' + clamp(Math.round(r), 0, 255) + ','
    + clamp(Math.round(g), 0, 255) + ','
    + clamp(Math.round(b), 0, 255) + ')';
}

/* Полный рендер бочки: поворот, перспектива, свет и блики on hoops */
function drawInspectBarrel() {
  const view = inspect3d;
  const canvas = view.canvas;
  if (!canvas) return;

  const ctx = view.ctx;
  if (!ctx) {
    view.art.innerHTML = barrelSVG(view.color);
    return;
  }

  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2 + 8;
  const scale = INSPECT3D_VIEW.scale;
  const cyaw = Math.cos(view.yaw);
  const syaw = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);

  ctx.clearRect(0, 0, W, H);

  /* мягкая тень на «полу» */
  const shadow = ctx.createRadialGradient(cx, cy + 172, 6, cx, cy + 172, 124);
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
  shadow.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 172, 124, 28, 0, 0, INSPECT_TAU);
  ctx.fill();

  const verts = inspect3dMesh.verts;
  const count = verts.length;
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const vz = new Float32Array(count);
  const px = new Float32Array(count);
  const py = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const v = verts[i];
    const r = inspect3dRotate(v[0], v[1], v[2], cyaw, syaw, cp, sp);
    vx[i] = r[0];
    vy[i] = r[1];
    vz[i] = r[2];

    const p = INSPECT3D_VIEW.focal / (INSPECT3D_VIEW.camDist - r[2]);
    px[i] = cx + r[0] * p * scale;
    py[i] = cy - r[1] * p * scale;
  }

  const projectPoint = (x, y, z) => {
    const p = inspect3dRotate(x, y, z, cyaw, syaw, cp, sp);
    const k = INSPECT3D_VIEW.focal / (INSPECT3D_VIEW.camDist - p[2]);
    return {
      x: cx + p[0] * k * scale,
      y: cy - p[1] * k * scale,
      z: p[2],
    };
  };

  const tierRgb = inspect3dHex(view.color);
  const metalRgb = inspect3dMix({ r: 124, g: 136, b: 130 }, tierRgb, 0.16);
  const light = INSPECT3D_VIEW.light;
  const visibleFaces = [];

  for (const face of inspect3dMesh.faces) {
    const [a, b, c, d] = face.v;

    const e1x = vx[b] - vx[a], e1y = vy[b] - vy[a], e1z = vz[b] - vz[a];
    const e2x = vx[d] - vx[a], e2y = vy[d] - vy[a], e2z = vz[d] - vz[a];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;

    const mx = (vx[a] + vx[b] + vx[c] + vx[d]) / 4;
    const my = (vy[a] + vy[b] + vy[c] + vy[d]) / 4;
    const mz = (vz[a] + vz[b] + vz[c] + vz[d]) / 4;

    /* нормаль наружу, затем отсечение задних граней */
    if (nx * mx + ny * my + nz * mz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    let viewX = -mx;
    let viewY = -my;
    let viewZ = INSPECT3D_VIEW.camDist - mz;
    const viewLen = Math.hypot(viewX, viewY, viewZ) || 1;
    viewX /= viewLen;
    viewY /= viewLen;
    viewZ /= viewLen;

    if (nx * viewX + ny * viewY + nz * viewZ <= 0) continue;

    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    const diffuse = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
    const shade = 0.34 + diffuse * 0.8;

    const base = face.metal ? metalRgb : tierRgb;
    let tint = 1;
    if (!face.metal) {
      const noise = Math.sin(face.stave * 12.9898 + 4.1414) * 43758.5453;
      tint = 0.93 + (noise - Math.floor(noise)) * 0.13;
    }

    let cr = base.r * shade * tint;
    let cg = base.g * shade * tint;
    let cb = base.b * shade * tint;

    if (face.metal) {
      let hx = light[0], hy = light[1], hz = light[2] + 1;
      const hLen = Math.hypot(hx, hy, hz) || 1;
      hx /= hLen;
      hy /= hLen;
      hz /= hLen;
      const spec = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 26);
      cr += spec * 95;
      cg += spec * 100;
      cb += spec * 95;
    }

    visibleFaces.push({
      depth: mz,
      color: inspect3dCss(cr, cg, cb),
      pts: [a, b, c, d],
    });
  }

  visibleFaces.sort((p, q) => p.depth - q.depth);

  for (const face of visibleFaces) {
    const pts = face.pts;
    ctx.beginPath();
    ctx.moveTo(px[pts[0]], py[pts[0]]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(px[pts[i]], py[pts[i]]);
    ctx.closePath();
    ctx.fillStyle = face.color;
    ctx.fill();
    ctx.strokeStyle = face.color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* вертикальные стыки клёпок — только на видимой стороне */
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1.1;

  for (let j = 0; j < INSPECT3D_VIEW.segments; j++) {
    const angle = (j / INSPECT3D_VIEW.segments) * INSPECT_TAU;
    const normal = inspect3dRotate(Math.cos(angle), 0, Math.sin(angle), cyaw, syaw, cp, sp);
    if (normal[2] <= 0.03) continue;

    let path = false;
    for (let i = 0; i < INSPECT3D_VIEW.rings; i++) {
      const tm = (i + 0.5) / INSPECT3D_VIEW.rings;
      const metal = INSPECT_HOOPS.some((h) => tm > h.t0 && tm < h.t1);

      if (metal) {
        if (path) {
          ctx.stroke();
          path = false;
        }
        continue;
      }

      const a = i * INSPECT3D_VIEW.segments + j;
      const b = (i + 1) * INSPECT3D_VIEW.segments + j;

      if (!path) {
        ctx.beginPath();
        ctx.moveTo(px[a], py[a]);
        path = true;
      }
      ctx.lineTo(px[b], py[b]);
    }

    if (path) ctx.stroke();
  }

  /* кромки обручей: тёмный низ и светлый верх */
  for (const hoop of INSPECT_HOOPS) {
    const edges = [
      { t: hoop.t0, color: 'rgba(0, 0, 0, 0.42)', width: 2 },
      { t: hoop.t1, color: 'rgba(240, 248, 244, 0.5)', width: 1.3 },
    ];

    for (const edge of edges) {
      const y = (edge.t - 0.5) * INSPECT3D_VIEW.height;
      const radius = inspect3dRadius(edge.t) + 0.7;

      for (let j = 0; j < INSPECT3D_VIEW.segments; j++) {
        const a0 = (j / INSPECT3D_VIEW.segments) * INSPECT_TAU;
        const a1 = ((j + 1) / INSPECT3D_VIEW.segments) * INSPECT_TAU;
        const mid = (a0 + a1) / 2;
        const normal = inspect3dRotate(Math.cos(mid), 0, Math.sin(mid), cyaw, syaw, cp, sp);
        if (normal[2] <= 0.05) continue;

        const p0 = projectPoint(Math.cos(a0) * radius, y, Math.sin(a0) * radius);
        const p1 = projectPoint(Math.cos(a1) * radius, y, Math.sin(a1) * radius);

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = edge.color;
        ctx.lineWidth = edge.width;
        ctx.stroke();
      }
    }
  }

  /* заклёпки на обручах */
  for (const hoop of INSPECT_HOOPS) {
    const t = (hoop.t0 + hoop.t1) / 2;
    const y = (t - 0.5) * INSPECT3D_VIEW.height;
    const radius = inspect3dRadius(t) + 1.6;

    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * INSPECT_TAU + 0.2;
      const normal = inspect3dRotate(Math.cos(angle), 0, Math.sin(angle), cyaw, syaw, cp, sp);
      if (normal[2] <= 0.18) continue;

      const point = projectPoint(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      const size = 2.4 * (INSPECT3D_VIEW.focal / (INSPECT3D_VIEW.camDist - point.z)) * scale;

      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, INSPECT_TAU);
      ctx.fillStyle = '#202824';
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 235, 228, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* крышка и дно */
  const capPoly = (ringIndex, radiusFactor) => {
    const t = ringIndex / INSPECT3D_VIEW.rings;
    const y = (t - 0.5) * INSPECT3D_VIEW.height;
    const radius = inspect3dRadius(t) * radiusFactor;
    const pts = [];

    for (let j = 0; j < INSPECT3D_VIEW.segments; j++) {
      const a = (j / INSPECT3D_VIEW.segments) * INSPECT_TAU;
      pts.push(projectPoint(Math.cos(a) * radius, y, Math.sin(a) * radius));
    }

    return pts;
  };

  const drawPolygon = (pts, fill, stroke, lineWidth) => {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  };

  const topNormal = inspect3dRotate(0, 1, 0, cyaw, syaw, cp, sp);
  if (topNormal[2] > 0.02) {
    const outer = capPoly(INSPECT3D_VIEW.rings, 1);
    const inner = capPoly(INSPECT3D_VIEW.rings, 0.74);
    const center = projectPoint(0, INSPECT3D_VIEW.height / 2, 0);

    let capRadius = 1;
    for (const p of outer) {
      capRadius = Math.max(capRadius, Math.hypot(p.x - center.x, p.y - center.y));
    }

    const grad = ctx.createRadialGradient(
      center.x, center.y, capRadius * 0.12,
      center.x, center.y, capRadius
    );
    grad.addColorStop(0, inspect3dCss(tierRgb.r * 1.12, tierRgb.g * 1.12, tierRgb.b * 1.12));
    grad.addColorStop(0.6, inspect3dCss(tierRgb.r * 0.62, tierRgb.g * 0.62, tierRgb.b * 0.62));
    grad.addColorStop(1, inspect3dCss(tierRgb.r * 0.28, tierRgb.g * 0.28, tierRgb.b * 0.28));

    drawPolygon(outer, grad, 'rgba(255, 255, 255, 0.22)', 1.4);

    /* закрытая деревянная крышка, а не чёрная дыра */
    const lid = ctx.createRadialGradient(
      center.x - capRadius * 0.18, center.y - capRadius * 0.2, capRadius * 0.08,
      center.x, center.y, capRadius * 0.78
    );
    lid.addColorStop(0, inspect3dCss(tierRgb.r * 0.72, tierRgb.g * 0.62, tierRgb.b * 0.46));
    lid.addColorStop(0.7, inspect3dCss(tierRgb.r * 0.38, tierRgb.g * 0.31, tierRgb.b * 0.22));
    lid.addColorStop(1, inspect3dCss(tierRgb.r * 0.22, tierRgb.g * 0.18, tierRgb.b * 0.13));
    drawPolygon(inner, lid, 'rgba(0, 0, 0, 0.45)', 1.4);

    /* доски крышки */
    const lidRadius = inspect3dRadius(1) * 0.74;
    const lidY = INSPECT3D_VIEW.height / 2 + 0.4;

    for (const zf of [-0.4, 0, 0.4]) {
      const xr = Math.sqrt(1 - zf * zf) * lidRadius;
      const p0 = projectPoint(-xr, lidY, zf * lidRadius);
      const p1 = projectPoint(xr, lidY, zf * lidRadius);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const bottomNormal = inspect3dRotate(0, -1, 0, cyaw, syaw, cp, sp);
  if (bottomNormal[2] > 0.02) {
    const outer = capPoly(0, 1);
    const inner = capPoly(0, 0.8);

    drawPolygon(
      outer,
      inspect3dCss(tierRgb.r * 0.5, tierRgb.g * 0.5, tierRgb.b * 0.5),
      'rgba(255, 255, 255, 0.12)',
      1.2
    );
    drawPolygon(
      inner,
      inspect3dCss(tierRgb.r * 0.34, tierRgb.g * 0.28, tierRgb.b * 0.2),
      'rgba(0, 0, 0, 0.55)',
      1.2
    );
  }
}

function startInspectInertia() {
  cancelAnimationFrame(inspect3d.raf);

  const step = () => {
    inspect3d.velYaw *= 0.93;
    inspect3d.velPitch *= 0.93;

    if (Math.abs(inspect3d.velYaw) < 0.00035 && Math.abs(inspect3d.velPitch) < 0.00035) return;

    inspect3d.yaw += inspect3d.velYaw;
    inspect3d.pitch = clamp(inspect3d.pitch + inspect3d.velPitch, -1.15, 1.15);
    drawInspectBarrel();
    inspect3d.raf = requestAnimationFrame(step);
  };

  inspect3d.raf = requestAnimationFrame(step);
}

function initInspect3D() {
  const canvas = inspect3d.canvas;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  inspect3d.ctx = ctx;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;

    inspect3d.dragging = true;
    inspect3d.pointerId = e.pointerId;
    inspect3d.lastX = e.clientX;
    inspect3d.lastY = e.clientY;
    inspect3d.velYaw = 0;
    inspect3d.velPitch = 0;

    cancelAnimationFrame(inspect3d.raf);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* без захвата тоже работает */ }

    canvas.classList.add('dragging');
    inspect3d.art.classList.add('dragging');
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!inspect3d.dragging) return;

    const dx = e.clientX - inspect3d.lastX;
    const dy = e.clientY - inspect3d.lastY;
    inspect3d.lastX = e.clientX;
    inspect3d.lastY = e.clientY;

    inspect3d.yaw += dx * 0.011;
    inspect3d.pitch = clamp(inspect3d.pitch + dy * 0.007, -1.15, 1.15);
    inspect3d.velYaw = dx * 0.0018;
    inspect3d.velPitch = dy * 0.0014;

    drawInspectBarrel();
    e.preventDefault();
  });

  const endDrag = () => {
    if (!inspect3d.dragging) return;

    inspect3d.dragging = false;
    canvas.classList.remove('dragging');
    inspect3d.art.classList.remove('dragging');

    if (inspect3d.pointerId !== null && canvas.hasPointerCapture(inspect3d.pointerId)) {
      try { canvas.releasePointerCapture(inspect3d.pointerId); } catch (err) { /* уже отпущен */ }
    }

    inspect3d.pointerId = null;
    startInspectInertia();
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('dblclick', () => {
    inspect3d.yaw = -0.5;
    inspect3d.pitch = 0.16;
    inspect3d.velYaw = 0;
    inspect3d.velPitch = 0;
    drawInspectBarrel();
  });
}

initInspect3D();

function fieldTierCount(tierIndex) {
  let count = 0;
  for (const cell of state.field) {
    if (cell && cell.tier === tierIndex) count += 1;
  }
  return count;
}

function renderBarrelInspect() {
  if (inspectIndex < 0) return;

  const tier = TIERS[inspectIndex];
  if (!tier) return;

  const owned = state.barrels[tier.id] || 0;
  const one = tierSingleCost(tier, owned);
  const ten = tierBulkCost(tier, owned, 10);
  const perBarrel = tier.income * multiplier(state);
  const unlocked = tierUnlocked(state, inspectIndex);
  const onField = fieldTierCount(inspectIndex);

  inspect3d.color = tier.color;
  drawInspectBarrel();

  $('inspectLevel').textContent = 'Уровень ' + (inspectIndex + 1) + ' / ' + TIERS.length;
  $('inspectName').textContent = tier.name;
  $('inspectDesc').textContent = tier.desc;

  $('inspectGrid').innerHTML = [
    ['Доход за бочку', '+' + fmt(perBarrel) + '/сек'],
    ['Куплено', fmt(owned) + ' шт.'],
    ['Доход с покупок', '+' + fmt(owned * perBarrel) + '/сек'],
    ['На поле', fmt(onField) + ' шт.'],
    ['Цена ×1', fmtPrice(one)],
    ['Цена ×10', fmtPrice(ten)],
  ].map(([label, value]) => `
      <div class="inspect-stat">
        <span>${label}</span>
        <b>${value}</b>
      </div>`).join('');

  $('inspectNote').textContent = unlocked
    ? 'Бочка открыта · место в коллекции ' + (inspectIndex + 1) + ' из ' + TIERS.length
    : 'Бочка ещё закрыта: купи предыдущий уровень или накопи '
      + fmtPrice(Math.ceil(tier.cost * 0.25)) + ' скрапа';

  $('inspectPrev').disabled = inspectIndex <= 0;
  $('inspectNext').disabled = inspectIndex >= TIERS.length - 1;
}

function openBarrelInspect(tierId) {
  const index = TIERS.findIndex((t) => t.id === tierId);
  if (index < 0) return;

  inspectIndex = index;

  /* при открытии показываем бочку в удобном ракурсе 3/4 */
  cancelAnimationFrame(inspect3d.raf);
  inspect3d.yaw = -0.5;
  inspect3d.pitch = 0.16;
  inspect3d.velYaw = 0;
  inspect3d.velPitch = 0;

  inspectSheet.hidden = false;
  renderBarrelInspect();
  $('inspectClose').focus({ preventScroll: true });
}

function closeBarrelInspect() {
  inspectSheet.hidden = true;
  inspectIndex = -1;

  inspect3d.dragging = false;
  inspect3d.velYaw = 0;
  inspect3d.velPitch = 0;
  cancelAnimationFrame(inspect3d.raf);
  inspect3d.canvas.classList.remove('dragging');
  inspect3d.art.classList.remove('dragging');
}

function stepBarrelInspect(delta) {
  if (inspectIndex < 0) return;

  const next = clamp(inspectIndex + delta, 0, TIERS.length - 1);
  if (next === inspectIndex) return;

  inspectIndex = next;
  renderBarrelInspect();
}

$('inspectClose').addEventListener('click', closeBarrelInspect);
inspectSheet.addEventListener('click', (e) => {
  if (e.target === inspectSheet) closeBarrelInspect();
});
$('inspectPrev').addEventListener('click', () => stepBarrelInspect(-1));
$('inspectNext').addEventListener('click', () => stepBarrelInspect(1));

/* клик по глазу в карточке бочки — открыть осмотр */
viewsEl.addEventListener('click', (e) => {
  const eye = e.target.closest('.barrel-eye');
  if (!eye) return;

  e.preventDefault();
  e.stopPropagation();
  openBarrelInspect(eye.dataset.inspect);
});

$('stormCall').addEventListener('click', callStorm);
$('prestigeBtn').addEventListener('click', prestigeRun);

/* поиск уровня в магазине бочек */
function flashBarrel(index) {
  const tier = TIERS[index];
  const box = $('barrelGrid');
  if (!tier || !box) return;

  const card = box.querySelector('.barrel-card[data-barrel="' + tier.id + '"]');
  if (!card) return;

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('flash');
  void card.offsetWidth;
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1400);
}

function jumpToBarrel(index) {
  showView('barrels');
  const safe = clamp(Math.floor(index), 0, TIERS.length - 1);
  $('barrelJump').value = safe + 1;
  setTimeout(() => flashBarrel(safe), 30);
}

$('barrelJumpBtn').addEventListener('click', () => {
  const value = Math.floor(Number($('barrelJump').value));
  if (!Number.isFinite(value) || value < 1 || value > TIERS.length) {
    toast('Введи номер уровня от 1 до ' + TIERS.length);
    return;
  }
  jumpToBarrel(value - 1);
});

$('barrelJump').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  $('barrelJumpBtn').click();
});

$('barrelNowBtn').addEventListener('click', () => jumpToBarrel(spawnTier(state)));

/* ---------------------------------- сохранения и сброс ---------------------------------- */

$('exportBtn').addEventListener('click', async () => {
  const json = JSON.stringify(state, null, 2);

  try {
    await navigator.clipboard.writeText(json);
  } catch (e) {
    /* нет доступа к буферу — просто скачиваем файл */
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'barrel-clicker-save.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object') throw new Error('bad file');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    state = loadState();
    selectedCell = -1;
    lastEtaText = '';
    clearStormRain();
    renderAll();
    toast('Сохранение загружено', 'good');
  } catch (err) {
    toast('Не удалось прочитать файл', 'bad');
  } finally {
    e.target.value = '';
  }
});

$('resetBtn').addEventListener('click', () => {
  if (!confirm('Точно сбросить весь прогресс? Это действие необратимо.')) return;
  resetState();
  state = loadState();
  selectedCell = -1;
  lastEtaText = '';
  clearStormRain();
  renderAll();
  closeMore();
});

/* ---------------------------------- админ-панель ---------------------------------- */

/* Секретный вход: 10 быстрых кликов по логотипу в левом верхнем углу.
   Пароль хранится прямо в коде — это локальная игра без серверов. */
const ADMIN_PASSWORD = 'Adfsfk234jhg423847h7823';
const ADMIN_CLICKS = 10;
const ADMIN_CLICK_GAP = 1200;

const brandMark = $('brandMark');
const adminGate = $('adminGate');
const adminPanel = $('adminPanel');

let adminClicks = 0;
let adminClickTimer = 0;
let adminWrong = 0;
let adminClosing = false;

function openAdminGate() {
  if (adminClosing) return;
  adminGate.hidden = false;
  $('adminError').textContent = '';
  const input = $('adminPassword');
  input.value = '';
  setTimeout(() => input.focus(), 80);
}

function closeAdminGate() {
  if (adminClosing) return;
  adminGate.hidden = true;
}

brandMark.addEventListener('click', () => {
  clearTimeout(adminClickTimer);
  adminClicks += 1;
  adminClickTimer = setTimeout(() => { adminClicks = 0; }, ADMIN_CLICK_GAP);

  if (adminClicks < ADMIN_CLICKS) return;

  adminClicks = 0;
  clearTimeout(adminClickTimer);
  openAdminGate();
});

$('adminGateClose').addEventListener('click', closeAdminGate);
adminGate.addEventListener('click', (e) => {
  if (e.target === adminGate) closeAdminGate();
});

function tryAdminLogin() {
  if (adminClosing) return;

  if ($('adminPassword').value !== ADMIN_PASSWORD) {
    adminWrong += 1;

    if (adminWrong === 1) {
      $('adminError').textContent = 'Не в этот раз';
    } else if (adminWrong === 2) {
      $('adminError').textContent = 'Не наглей';
    } else {
      adminCloseGame();
    }
    return;
  }

  adminWrong = 0;
  closeAdminGate();
  openAdminPanel();
}

/* Третья ошибка: «Вали отсюда» и через 3 секунды игра закрывается */
function adminCloseGame() {
  adminClosing = true;
  gameStopped = true;

  const input = $('adminPassword');
  const btn = $('adminLoginBtn');
  input.disabled = true;
  btn.disabled = true;

  let left = 3;
  $('adminError').textContent = 'Вали отсюда · ' + left;

  const timer = setInterval(() => {
    left -= 1;

    if (left > 0) {
      $('adminError').textContent = 'Вали отсюда · ' + left;
      return;
    }

    clearInterval(timer);
    $('adminError').textContent = 'Вали отсюда';
    window.close();

    /* в браузере window.close() может быть заблокирован — гасим экран */
    setTimeout(() => {
      document.body.innerHTML = '<div class="game-closed">Игра закрыта</div>';
    }, 200);
  }, 1000);
}

$('adminLoginBtn').addEventListener('click', tryAdminLogin);
$('adminPassword').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  tryAdminLogin();
});

function openAdminPanel() {
  adminPanel.hidden = false;
  refreshAdminPanel();
}

function closeAdminPanel() {
  adminPanel.hidden = true;
}

$('adminClose').addEventListener('click', closeAdminPanel);
adminPanel.addEventListener('click', (e) => {
  if (e.target === adminPanel) closeAdminPanel();
});

document.addEventListener('keydown', (e) => {
  if (!inspectSheet.hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeBarrelInspect();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepBarrelInspect(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepBarrelInspect(1);
      return;
    }
  }

  if (e.key !== 'Escape') return;
  if (!adminGate.hidden) closeAdminGate();
  else if (!adminPanel.hidden) closeAdminPanel();
});

function refreshAdminPanel() {
  let magnetLevels = 0;
  let magnetMax = 0;
  for (const key of Object.keys(MAGNET_UPGRADES)) {
    magnetLevels += magnetShopLevel(state, key);
    magnetMax += MAGNET_UPGRADES[key].max;
  }

  $('adminScrapNow').textContent = 'сейчас: ' + fmt(state.scrap || 0) + ' скрапа';
  $('adminMagnetsNow').textContent = 'сейчас: ' + fmt(state.magnets || 0) + ' 🧲';
  $('adminGoldenNow').textContent = 'сейчас: ' + fmt(state.goldenScrap || 0) + ' 🏅';
  $('adminStarsNow').textContent = 'сейчас: ' + (state.stars || 0) + ' / ' + STARS_MAX;
  $('adminFieldNow').textContent = 'на поле: ' + fieldCount(state) + ' / ' + fieldSize(state)
    + ' · спавн: ' + (spawnTier(state) + 1) + '-й уровень';
  $('adminSpawnNow').textContent = 'скорость: ' + (state.upgrades.spawn || 0) + ' / ' + SPAWN_MAX_LEVEL
    + ' · старт: ' + (spawnTier(state) + 1) + '-й уровень';
  $('adminUpgradesNow').textContent = 'магнитный магазин: ' + magnetLevels + ' / ' + magnetMax;
}

/* Ввод понимает и «1e30», и запятую вместо точки */
function adminNum(id) {
  const raw = String($(id).value || '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!raw) return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function adminTierValue(id) {
  const value = Math.floor(adminNum(id));
  if (!Number.isFinite(value) || value < 1 || value > TIERS.length) return -1;
  return value - 1;
}

function adminApply(action) {
  switch (action) {
    case 'scrap-add': {
      const value = adminNum('adminScrap');
      if (!(value > 0)) return toast('Введи сумму больше нуля', 'bad');
      gainScrap(value);
      toast('+' + fmt(value) + ' скрапа', 'good');
      break;
    }

    case 'scrap-set': {
      const value = adminNum('adminScrap');
      if (!(value >= 0)) return toast('Введи сумму', 'bad');
      state.scrap = value;
      state.totalScrap = Math.max(state.totalScrap || 0, value);
      toast('Скрап: ' + fmt(value), 'good');
      break;
    }

    case 'magnets-add': {
      const value = Math.floor(adminNum('adminMagnets'));
      if (!(value > 0)) return toast('Введи количество магнитов', 'bad');
      state.magnets = (state.magnets || 0) + value;
      pulseStat('magnets');
      toast('+' + fmt(value) + ' 🧲', 'good');
      break;
    }

    case 'magnets-set': {
      const value = Math.floor(adminNum('adminMagnets'));
      if (!(value >= 0)) return toast('Введи количество магнитов', 'bad');
      state.magnets = value;
      pulseStat('magnets');
      toast('Магниты: ' + fmt(value), 'good');
      break;
    }

    case 'golden-add': {
      const value = Math.floor(adminNum('adminGolden'));
      if (!(value > 0)) return toast('Введи количество золотого скрапа', 'bad');
      state.goldenScrap = (state.goldenScrap || 0) + value;
      toast('+' + fmt(value) + ' 🏅', 'good');
      break;
    }

    case 'golden-set': {
      const value = Math.floor(adminNum('adminGolden'));
      if (!(value >= 0)) return toast('Введи количество золотого скрапа', 'bad');
      state.goldenScrap = value;
      toast('Золотой скрап: ' + fmt(value), 'good');
      break;
    }

    case 'stars-set': {
      const value = Math.floor(adminNum('adminStars'));
      if (!Number.isFinite(value)) return toast('Введи количество звёзд', 'bad');
      state.stars = clamp(value, 0, STARS_MAX);
      toast('Звёзды: ' + state.stars + ' / ' + STARS_MAX, 'good');
      break;
    }

    case 'field-spawn': {
      const tier = adminTierValue('adminTier');
      if (tier < 0) return toast('Уровень от 1 до ' + TIERS.length, 'bad');
      const index = spawnOnField(tier);
      if (index < 0) return toast('Поле уже заполнено', 'bad');
      toast('На поле: бочка ' + (tier + 1) + '-го уровня', 'good');
      break;
    }

    case 'field-fill': {
      const chosen = adminTierValue('adminTier');
      const tier = chosen < 0 ? spawnTier(state) : chosen;
      let added = 0;
      while (fieldCount(state) < fieldSize(state)) {
        if (spawnOnField(tier) < 0) break;
        added += 1;
      }
      toast(added ? 'Добавлено бочек: ' + added : 'Поле уже заполнено', added ? 'good' : 'bad');
      break;
    }

    case 'field-clear': {
      state.field = new Array(fieldSize(state)).fill(null);
      selectedCell = -1;
      toast('Поле очищено', 'good');
      break;
    }

    case 'unlock-barrels': {
      for (const t of TIERS) {
        if (!state.barrels[t.id]) state.barrels[t.id] = 1;
      }
      toast('Открыты все ' + TIERS.length + ' уровней', 'good');
      break;
    }

    case 'speed-set': {
      const value = Math.floor(adminNum('adminSpeed'));
      if (!Number.isFinite(value) || value < 0 || value > SPAWN_MAX_LEVEL) {
        return toast('Скорость от 0 до ' + SPAWN_MAX_LEVEL, 'bad');
      }
      state.upgrades.spawn = value;
      toast('Скорость спавна: ' + value, 'good');
      break;
    }

    case 'start-set': {
      const value = Math.floor(adminNum('adminStart'));
      if (!Number.isFinite(value) || value < 0 || value >= TIERS.length) {
        return toast('Стартовый уровень от 0 до ' + (TIERS.length - 1), 'bad');
      }
      state.upgrades.level = value;
      toast('Стартовый уровень: ' + (value + 1), 'good');
      break;
    }

    case 'max-upgrades': {
      for (const key of Object.keys(UPGRADES)) state.upgrades[key] = UPGRADES[key].max;
      while (state.field.length < fieldSize(state)) state.field.push(null);
      while (state.field.length > fieldSize(state)) state.field.pop();
      toast('Все улучшения максимальны', 'good');
      break;
    }

    case 'max-magnets': {
      for (const key of Object.keys(MAGNET_UPGRADES)) {
        state.magnetShop[key] = MAGNET_UPGRADES[key].max;
      }
      toast('Магнитный магазин прокачан', 'good');
      break;
    }

    case 'reset-run': {
      if (!confirm('Сбросить забег? Скрап и бочки обнулятся, звёзды и магниты останутся.')) return;
      resetRun(state);
      selectedCell = -1;
      lastEtaText = '';
      clearStormRain();
      toast('Забег сброшен', 'good');
      break;
    }

    case 'reset-all': {
      if (!confirm('Полный сброс: удалить весь прогресс, включая звёзды и магнитный магазин?')) return;
      resetState();
      state = loadState();
      selectedCell = -1;
      lastEtaText = '';
      clearStormRain();
      toast('Прогресс полностью сброшен', 'good');
      break;
    }

    default:
      return;
  }

  saveState(state);
  renderAll();
  refreshAdminPanel();
}

adminPanel.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-admin]');
  if (!btn) return;
  adminApply(btn.dataset.admin);
});

/* ---------------------------------- старт ---------------------------------- */

function renderAll() {
  renderTop();
  renderShop();
  renderField();
  updateEta();
  renderStorm();
  if (inspectIndex >= 0) renderBarrelInspect();
}

function start() {
  /* офлайн-доход за время отсутствия */
  const away = (Date.now() - (state.lastTick || Date.now())) / 1000;
  if (away > 60 && perSecond(state) > 0) {
    const earned = perSecond(state) * Math.min(away, offlineSeconds(state));
    gainScrap(earned);
    setTimeout(() => toast('Пока тебя не было: +' + fmt(earned) + ' скрапа'), 400);
  }

  state.lastTick = Date.now();
  renderAll();
  requestAnimationFrame(tick);
}

start();
