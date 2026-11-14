/* Barrel Clicker — аккаунты, облачные сохранения и рейтинг.
   Работает через Supabase Auth / PostgREST. Гостевой режим полностью локальный:
   без входа игра не обращается к Supabase. */
(() => {
  'use strict';

  const CONFIG = window.BC_SUPABASE || {};

  /* Страховка на случай, если ключи добавили позже сборки: конфиг можно
     положить рядом с игрой на сайте и не пересобирать exe. */
  const REMOTE_CONFIG_URL = 'https://themrlimon.github.io/barrel-clicker/play/account-config.json';

  const isConfigured = (c) =>
    /^https?:\/\/[^\s]+$/i.test(String((c && c.url) || '').trim()) &&
    String((c && c.anonKey) || '').length > 20;

  let configured = isConfigured(CONFIG);

  const STORAGE_KEY = 'barrelClicker.save.v1';
  const MODE_KEY = 'bc.account.mode';
  const ONBOARD_KEY = 'bc.account.onboarded';
  const PROFILE_KEY = 'bc.account.profile';
  const CODE_MIN = 6;
  const CODE_MAX = 10;
  const PUSH_MIN_INTERVAL = 20000;
  const PUSH_DEBOUNCE = 4000;

  const sheet = document.getElementById('accountSheet');
  const body = document.getElementById('accountBody');
  const titleEl = document.getElementById('accountTitle');
  const closeBtn = document.getElementById('accountClose');
  const onboard = document.getElementById('accountOnboard');
  const accountBtn = document.getElementById('accountBtn');
  const accountDot = document.getElementById('accountDot');
  const accountBtnIco = document.getElementById('accountBtnIco');
  const accountRowBtn = document.getElementById('accountRowBtn');
  const statusText = document.getElementById('accountStatusText');

  if (!sheet || !body) return;

  function makeClient(c) {
    if (!window.supabase) return null;
    return window.supabase.createClient(String(c.url).replace(/\/+$/, ''), c.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'bc.auth.token',
      },
    });
  }

  let sb = configured ? makeClient(CONFIG) : null;

  async function ensureConfig() {
    if (configured && sb) return true;
    try {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
      const res = await fetch(REMOTE_CONFIG_URL, {
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) return false;
      const data = await res.json();
      if (!isConfigured(data)) return false;
      CONFIG.url = data.url;
      CONFIG.anonKey = data.anonKey;
      configured = true;
      sb = makeClient(CONFIG);
      if (sb) await startAuth();
      return !!sb;
    } catch (e) {
      return false;
    }
  }

  let session = null;
  let profile = null;
  let view = 'guest';
  let busy = false;
  let pendingEmail = '';
  let pendingMode = '';
  let pendingPassword = '';
  let pendingNickname = '';
  let resendTimer = null;
  let resendLeft = 0;

  let cloudReady = false;
  let cloudState = 'idle';
  let cloudError = '';
  let lastSyncAt = 0;
  let pushTimer = null;
  let pushInFlight = false;
  let pushQueued = false;
  let lastPushAt = 0;
  let lastPushSig = '';
  let bootSyncDone = false;
  let conflictCloud = null;

  const fmt = (n) => {
    try {
      if (window.BC && typeof window.BC.fmt === 'function') return window.BC.fmt(n);
    } catch (e) {}
    return String(Math.floor(Number(n) || 0));
  };

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const toast = (text, kind) => {
    try {
      if (window.BC_GAME && typeof window.BC_GAME.toast === 'function') window.BC_GAME.toast(text, kind);
    } catch (e) {}
  };

  const maskEmail = (email) => {
    const s = String(email || '');
    const at = s.indexOf('@');
    if (at < 1) return s;
    const name = s.slice(0, at);
    const keep = name.length <= 2 ? 1 : 2;
    return name.slice(0, keep) + '•'.repeat(Math.max(2, Math.min(6, name.length - keep))) + s.slice(at);
  };

  const timeText = (ms) => {
    if (!ms) return '—';
    try {
      return new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '—';
    }
  };

  /* ------------------------------------------------------------ ошибки */

  function humanError(err) {
    const msg = String((err && (err.message || err.error_description || err.msg)) || err || '');
    const lower = msg.toLowerCase();

    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
      return 'Нет соединения с сервером. Проверь интернет и попробуй ещё раз.';
    }
    if (lower.includes('invalid login credentials')) return 'Неверный пароль.';
    if (lower.includes('email not confirmed')) return 'Почта ещё не подтверждена. Введи код из письма.';
    if (lower.includes('user already registered')) return 'Эта почта уже зарегистрирована. Войди в аккаунт.';
    if (lower.includes('password should be at least')) return 'Пароль слишком короткий — нужно минимум 8 символов.';
    if (lower.includes('unable to validate email') || lower.includes('invalid email')) return 'Проверь адрес почты.';
    if (lower.includes('for security purposes') || lower.includes('rate limit') || lower.includes('too many')) {
      return 'Слишком часто. Подожди минуту и попробуй снова.';
    }
    if (lower.includes('token has expired') || lower.includes('invalid token') || lower.includes('otp')) {
      return 'Код не подошёл или устарел. Запроси новый.';
    }
    if (lower.includes('database error saving new user')) {
      return 'Не удалось создать профиль: возможно, ник уже занят. Попробуй другой.';
    }
    if (lower.includes('duplicate key') || lower.includes('unique')) return 'Этот ник уже занят. Выбери другой.';
    return msg || 'Что-то пошло не так. Попробуй ещё раз.';
  }

  const codeError = {
    no_user: 'Такой ник не найден. Проверь написание или зарегистрируйся.',
    bad_password: 'Неверный пароль.',
    rate_limited: 'Слишком много попыток. Подожди несколько минут.',
    send_failed: 'Не удалось отправить письмо. Попробуй позже.',
  };

  /* ------------------------------------------------------------ экраны */

  function setView(next) {
    view = next;
    render();
  }

  function setBusy(flag) {
    busy = flag;
    body.classList.toggle('acc-busy', flag);
    body.querySelectorAll('button, input').forEach((el) => {
      if (flag) {
        el.setAttribute('disabled', 'disabled');
      } else {
        el.removeAttribute('disabled');
        /* не разблокируем «Отправить ещё раз», пока идёт отсчёт */
        if (el.hasAttribute('data-resend') && resendLeft > 0) el.setAttribute('disabled', 'disabled');
      }
    });
  }

  function errorBox(text) {
    return '<p class="acc-error" data-error role="alert">' + esc(text || '') + '</p>';
  }

  function setError(text) {
    const el = body.querySelector('[data-error]');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function render() {
    if (!configured) {
      titleEl.textContent = 'Аккаунт';
      body.innerHTML =
        '<div class="acc-empty">' +
        '<b>Аккаунты пока недоступны</b>' +
        '<p>Сервер аккаунтов ещё не подключён. Играй как гость — прогресс сохранится на этом устройстве.</p>' +
        '</div>';
      return;
    }

    if (view === 'register') renderRegister();
    else if (view === 'login') renderLogin();
    else if (view === 'code') renderCode();
    else if (view === 'conflict') renderConflict();
    else if (view === 'leaderboard') renderLeaderboard();
    else if (session) renderAccount();
    else renderGuest();

    updateChrome();
  }

  function renderGuest() {
    titleEl.textContent = 'Аккаунт';
    body.innerHTML =
      '<div class="acc-hero">' +
      '<div class="acc-avatar big">👤</div>' +
      '<b>Гостевой режим</b>' +
      '<p>Прогресс сохраняется только на этом устройстве. Если удалить игру или очистить данные — он пропадёт.</p>' +
      '</div>' +
      '<div class="acc-benefits">' +
      '<div><span>☁️</span><b>Облачное сохранение</b><p>Прогресс переживёт переустановку и переедет на другое устройство.</p></div>' +
      '<div><span>🏆</span><b>Рейтинг</b><p>Сравнивай скрап и уровень с другими игроками.</p></div>' +
      '<div><span>🔐</span><b>8-значный код</b><p>Вход подтверждается кодом на почту.</p></div>' +
      '</div>' +
      '<div class="acc-actions">' +
      '<button class="btn primary wide" data-acc="register">Создать аккаунт</button>' +
      '<button class="btn wide" data-acc="login">Войти</button>' +
      '</div>' +
      '<p class="acc-foot">В гостевом режиме прогресс не уходит в сеть.</p>';
  }

  function renderRegister() {
    titleEl.textContent = 'Регистрация';
    body.innerHTML =
      '<form class="acc-form" data-form="register" novalidate>' +
      '<label>Ник<input type="text" name="nickname" maxlength="16" autocomplete="username" placeholder="Например, ScrapMaster" required></label>' +
      '<label>Почта<input type="email" name="email" maxlength="120" autocomplete="email" placeholder="you@example.com" required></label>' +
      '<label>Пароль<input type="password" name="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="Минимум 8 символов" required></label>' +
      '<label>Пароль ещё раз<input type="password" name="password2" minlength="8" maxlength="72" autocomplete="new-password" placeholder="Повтори пароль" required></label>' +
      errorBox('') +
      '<div class="acc-actions">' +
      '<button class="btn primary wide" type="submit">Зарегистрироваться</button>' +
      '<button class="btn wide" type="button" data-acc="login">У меня уже есть аккаунт</button>' +
      '</div>' +
      '<p class="acc-foot">На почту придёт 8-значный код. Пароль хранится только на сервере и в игре не сохраняется.</p>' +
      '</form>';
    focusFirst();
  }

  function renderLogin() {
    titleEl.textContent = 'Вход';
    body.innerHTML =
      '<form class="acc-form" data-form="login" novalidate>' +
      '<label>Ник<input type="text" name="nickname" maxlength="16" autocomplete="username" placeholder="Твой ник" required></label>' +
      '<label>Пароль<input type="password" name="password" maxlength="72" autocomplete="current-password" placeholder="Пароль" required></label>' +
      errorBox('') +
      '<div class="acc-actions">' +
      '<button class="btn primary wide" type="submit">Получить код на почту</button>' +
      '<button class="btn wide" type="button" data-acc="register">Создать аккаунт</button>' +
      '</div>' +
      '<p class="acc-foot">Сначала проверим ник и пароль, затем отправим 8-значный код на привязанную почту.</p>' +
      '</form>';
    focusFirst();
  }

  function renderCode() {
    titleEl.textContent = pendingMode === 'signup' ? 'Подтверждение почты' : 'Код на почту';
    body.innerHTML =
      '<div class="acc-code-head">' +
      '<div class="acc-code-ico">✉️</div>' +
      '<b>' + (pendingMode === 'signup' ? 'Подтверди почту' : 'Подтверди вход') + '</b>' +
      '<p>Код отправлен на <b>' + esc(maskEmail(pendingEmail)) + '</b>. Введи 8 цифр из письма.</p>' +
      '</div>' +
      '<form class="acc-form" data-form="code" novalidate>' +
      '<input class="acc-code-input" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="00000000" aria-label="Код из письма" required>' +
      errorBox('') +
      '<div class="acc-actions">' +
      '<button class="btn primary wide" type="submit">Подтвердить</button>' +
      '<button class="btn wide" type="button" data-acc="resend" data-resend>Отправить код ещё раз</button>' +
      '<button class="btn wide" type="button" data-acc="back">Назад</button>' +
      '</div>' +
      '<p class="acc-foot">Письмо может попасть в «Спам». Код действует ограниченное время.</p>' +
      '</form>';
    startResendTimer(60);
    focusFirst();
  }

  function renderAccount() {
    titleEl.textContent = 'Аккаунт';
    const nick = (profile && profile.nickname) || (session && session.user.user_metadata && session.user.user_metadata.nickname) || 'Игрок';
    const email = (profile && profile.email) || (session && session.user.email) || '';
    const initial = esc(nick.trim().charAt(0).toUpperCase() || 'И');

    body.innerHTML =
      '<div class="acc-profile">' +
      '<div class="acc-avatar">' + initial + '</div>' +
      '<div class="acc-profile-text"><b>' + esc(nick) + '</b><span>' + esc(maskEmail(email)) + '</span></div>' +
      '<span class="badge on" data-cloud-badge>в облаке</span>' +
      '</div>' +
      '<div class="acc-sync-row">' +
      '<span class="acc-sync" data-sync>' + esc(syncText()) + '</span>' +
      '<button class="btn small" type="button" data-acc="sync">Синхронизировать</button>' +
      '</div>' +
      '<div class="acc-actions two">' +
      '<button class="btn" type="button" data-acc="leaderboard">🏆 Рейтинг</button>' +
      '<button class="btn" type="button" data-acc="logout">Выйти</button>' +
      '</div>' +
      '<p class="acc-foot">Прогресс автоматически уходит в облако после изменений и при выходе. На другом устройстве войди тем же аккаунтом — сохранение подтянется.</p>';
  }

  function renderLeaderboard() {
    titleEl.textContent = 'Рейтинг';
    body.innerHTML =
      '<div class="acc-actions two">' +
      '<button class="btn small" type="button" data-acc="account">← Назад</button>' +
      '<button class="btn small" type="button" data-acc="leader-refresh">Обновить</button>' +
      '</div>' +
      '<div class="acc-board" data-board><p class="acc-muted">Загружаю рейтинг…</p></div>';
    loadLeaderboard();
  }

  function syncText() {
    if (cloudState === 'syncing') return 'Сохраняю в облако…';
    if (cloudState === 'conflict') return 'Нужно выбрать сохранение';
    if (cloudState === 'error') return 'Облако недоступно: ' + (cloudError || 'проверь интернет');
    if (cloudState === 'paused') return 'Синхронизация приостановлена';
    if (lastSyncAt) return 'Синхронизировано ' + timeText(lastSyncAt);
    if (cloudState === 'ok') return 'Облако подключено';
    return 'Подключаю облако…';
  }

  function updateChrome() {
    const logged = !!session;
    accountDot.hidden = !logged;
    accountBtnIco.textContent = logged && profile && profile.nickname ? profile.nickname.charAt(0).toUpperCase() : '👤';
    accountBtn.title = logged ? 'Аккаунт: ' + profile.nickname : 'Аккаунт';

    if (statusText) {
      statusText.textContent = logged
        ? 'Аккаунт: ' + ((profile && profile.nickname) || 'игрок') + ' · облачное сохранение включено.'
        : 'Гостевой режим: прогресс хранится только на этом устройстве.';
    }
  }

  function refreshSyncUi() {
    const el = body.querySelector('[data-sync]');
    if (el) el.textContent = syncText();

    const badge = body.querySelector('[data-cloud-badge]');
    if (badge) {
      const bad = cloudState === 'error';
      badge.textContent = bad ? 'нет связи' : 'в облаке';
      badge.className = 'badge ' + (bad ? 'off' : 'on');
    }
  }

  function focusFirst() {
    const input = body.querySelector('input');
    if (!input) return;
    setTimeout(() => {
      try {
        input.focus({ preventScroll: true });
      } catch (e) {}
    }, 60);
  }

  /* ------------------------------------------------------------ шторка */

  async function openSheet(next) {
    onboard.hidden = true;
    sheet.hidden = false;

    if (next) {
      if (!configured && !(await ensureConfig())) {
        setView('guest');
        return;
      }
      setView(next);
      return;
    }

    if (!configured && !(await ensureConfig())) {
      setView('guest');
      return;
    }
    if (session) {
      if (conflictCloud) {
        setView('conflict');
        return;
      }
      setView('account');
      if (!bootSyncDone) syncAfterLogin();
      else refreshSyncUi();
    } else {
      setView('guest');
    }
  }

  function closeSheet() {
    if (busy) return;
    sheet.hidden = true;
    stopResendTimer();
  }

  async function maybeShowOnboard() {
    if (sheet.hidden === false) return;
    if (session) return;
    let done = false;
    try {
      done = localStorage.getItem(ONBOARD_KEY) === '1' || !!localStorage.getItem(MODE_KEY);
    } catch (e) {}
    if (done) return;
    if (!configured && !(await ensureConfig())) return;
    if (sheet.hidden === false) return;
    onboard.hidden = false;
  }

  /* ------------------------------------------------------------ таймер кода */

  function stopResendTimer() {
    if (resendTimer) {
      clearInterval(resendTimer);
      resendTimer = null;
    }
    resendLeft = 0;
  }

  function startResendTimer(seconds) {
    stopResendTimer();
    resendLeft = seconds;
    const btn = body.querySelector('[data-resend]');
    const paint = () => {
      if (!btn) return;
      if (resendLeft > 0) {
        btn.setAttribute('disabled', 'disabled');
        btn.textContent = 'Отправить ещё раз через ' + resendLeft + ' с';
      } else {
        btn.removeAttribute('disabled');
        btn.textContent = 'Отправить код ещё раз';
      }
    };
    paint();
    resendTimer = setInterval(() => {
      resendLeft -= 1;
      if (resendLeft <= 0) {
        stopResendTimer();
        paint();
        return;
      }
      paint();
    }, 1000);
  }

  /* ------------------------------------------------------------ регистрация */

  async function doRegister(form) {
    const nickname = String(form.nickname.value || '').trim();
    const email = String(form.email.value || '').trim().toLowerCase();
    const password = String(form.password.value || '');
    const password2 = String(form.password2.value || '');

    setError('');
    if (!/^[a-zA-Zа-яА-Я0-9_-]{3,16}$/.test(nickname)) {
      setError('Ник: 3–16 символов, буквы, цифры, дефис или подчёркивание.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError('Проверь адрес почты.');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов.');
      return;
    }
    if (password !== password2) {
      setError('Пароли не совпадают.');
      return;
    }

    setBusy(true);
    try {
      const { data: taken, error: nickErr } = await sb.rpc('nickname_taken', { nick: nickname });
      if (nickErr) throw nickErr;
      if (taken) {
        setError('Этот ник уже занят. Выбери другой.');
        return;
      }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { nickname } },
      });
      if (error) throw error;

      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError('Эта почта уже зарегистрирована. Войди в аккаунт.');
        return;
      }

      if (data && data.session) {
        await completeLogin(data.session, nickname);
        return;
      }

      pendingEmail = email;
      pendingMode = 'signup';
      pendingNickname = nickname;
      pendingPassword = '';
      setView('code');
      toast('Код отправлен на почту', 'good');
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------ вход */

  async function doLogin(form) {
    const nickname = String(form.nickname.value || '').trim();
    const password = String(form.password.value || '');

    setError('');
    if (nickname.length < 3) {
      setError('Введи ник.');
      return;
    }
    if (!password) {
      setError('Введи пароль.');
      return;
    }

    setBusy(true);
    try {
      /* Пароль проверяется в базе (bcrypt). Почта возвращается только при верном пароле. */
      const { data, error } = await sb.rpc('login_check', { nick: nickname, pass: password });
      if (error) throw error;

      if (!data || data.ok !== true) {
        const code = data && data.error;
        setError(codeError[code] || humanError(data) || 'Не удалось проверить аккаунт.');
        return;
      }

      const email = String(data.email || '').toLowerCase();
      const { error: otpError } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;

      pendingEmail = email;
      pendingMode = 'login';
      pendingPassword = password;
      pendingNickname = nickname;
      setView('code');
      toast('Код отправлен на ' + maskEmail(pendingEmail), 'good');
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function doVerifyCode(form) {
    const token = String(form.code.value || '').replace(/\D/g, '');
    setError('');
    if (token.length < CODE_MIN || token.length > CODE_MAX) {
      setError('Введи код из письма — от 6 до 10 цифр.');
      return;
    }

    setBusy(true);
    try {
      const type = pendingMode === 'signup' ? 'signup' : 'email';
      const { data, error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type });
      if (error) throw error;
      if (!data || !data.session) {
        setError('Код принят, но сессия не создалась. Попробуй войти заново.');
        return;
      }
      await completeLogin(data.session, pendingNickname);
      toast('Готово! Аккаунт подключён', 'good');
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function doResend() {
    if (resendLeft > 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      if (pendingMode === 'signup') {
        const { error } = await sb.auth.resend({ type: 'signup', email: pendingEmail });
        if (error) throw error;
      } else {
        const { error } = await sb.auth.signInWithOtp({
          email: pendingEmail,
          options: { shouldCreateUser: false },
        });
        if (error) throw error;
      }
      startResendTimer(60);
      toast('Новый код отправлен', 'good');
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function completeLogin(nextSession, fallbackNick) {
    session = nextSession;
    pendingPassword = '';
    bootSyncDone = false;
    cloudReady = false;
    cloudState = 'idle';

    try {
      localStorage.setItem(ONBOARD_KEY, '1');
      localStorage.setItem(MODE_KEY, 'account');
    } catch (e) {}

    try {
      profile = await fetchProfile(fallbackNick);
    } catch (err) {
      profile = {
        nickname: fallbackNick || (session.user.user_metadata && session.user.user_metadata.nickname) || 'Игрок',
        email: session.user.email || '',
      };
      cloudState = 'error';
      cloudError = 'профиль не загрузился';
    }

    if (profile && profile.nickname) {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      } catch (e) {}
    }

    setView('account');
    updateChrome();
    await syncAfterLogin();
  }

  async function fetchProfile(fallbackNick) {
    const uid = session.user.id;
    const { data, error } = await sb.from('profiles').select('nickname,email').eq('id', uid).maybeSingle();
    if (error) throw error;
    if (data) return data;
    return {
      nickname: fallbackNick || (session.user.user_metadata && session.user.user_metadata.nickname) || 'Игрок',
      email: session.user.email || '',
    };
  }

  /* ------------------------------------------------------------ облако */

  function progressOf(st) {
    st = st || {};
    return {
      totalScrap: Math.max(0, Math.floor(Number(st.totalScrap) || 0)),
      scrap: Math.max(0, Math.floor(Number(st.scrap) || 0)),
      level: Math.max(1, Math.floor(Number(st.level) || 1)),
      restarts: Math.max(0, Math.floor(Number(st.restarts) || 0)),
      goldenScrap: Math.max(0, Math.floor(Number(st.goldenScrap) || 0)),
    };
  }

  /* Совсем свежий запуск: игра только началась, прогресса нет */
  function isFresh(p) {
    return p.restarts === 0 && p.goldenScrap === 0 && p.level <= 1 && p.totalScrap < 1000 && p.scrap < 1000;
  }

  /* Похоже на то же самое сохранение (например, вход на том же устройстве) */
  function sameProgress(a, b) {
    if (a.restarts !== b.restarts || a.level !== b.level) return false;
    const big = Math.max(a.totalScrap, b.totalScrap, 1);
    return Math.abs(a.totalScrap - b.totalScrap) / big < 0.02;
  }

  async function readCloudSave() {
    const uid = session.user.id;
    const { data, error } = await sb.from('saves').select('data,updated_at').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function syncAfterLogin() {
    if (!session || bootSyncDone) return;
    bootSyncDone = true;
    cloudState = 'syncing';
    refreshSyncUi();

    try {
      const row = await readCloudSave();
      const localState =
        (window.BC_GAME && window.BC_GAME.getState && window.BC_GAME.getState()) || null;
      const local = progressOf(localState);

      /* в облаке ещё ничего нет — забираем локальный прогресс */
      if (!row || !row.data) {
        cloudReady = true;
        await pushNow('first');
        return;
      }

      const cloud = progressOf(row.data);

      /* новое устройство / переустановка: локально пусто — грузим облако */
      if (isFresh(local) && !isFresh(cloud)) {
        if (applyCloud(row)) {
          cloudReady = true;
          cloudState = 'ok';
        }
        return;
      }

      /* облако пустое, а локально уже играли — отправляем локальное */
      if (isFresh(cloud) && !isFresh(local)) {
        cloudReady = true;
        await pushNow('first');
        return;
      }

      /* тот же прогресс, просто вход заново — ничего не меняем */
      if (sameProgress(local, cloud)) {
        cloudReady = true;
        await pushNow('same');
        return;
      }

      /* оба сохранения настоящие и разные — решает игрок */
      conflictCloud = row;
      cloudState = 'conflict';
      setView('conflict');
    } catch (err) {
      cloudState = 'error';
      cloudError = humanError(err);
      refreshSyncUi();
    }
  }

  function renderConflict() {
    titleEl.textContent = 'Два сохранения';
    const local = progressOf(window.BC_GAME && window.BC_GAME.getState && window.BC_GAME.getState());
    const cloud = progressOf(conflictCloud && conflictCloud.data);

    const card = (title, p, act, extra) =>
      '<div class="acc-choice">' +
      '<b>' + title + '</b>' +
      '<span class="acc-choice-num">' + fmt(p.totalScrap) + ' скрапа</span>' +
      '<span class="acc-choice-meta">уровень ' + fmt(p.level) +
      (p.restarts ? ' · усилений ' + fmt(p.restarts) : '') +
      (p.goldenScrap ? ' · золотой скрап ' + fmt(p.goldenScrap) : '') +
      '</span>' +
      (extra ? '<span class="acc-choice-note">' + extra + '</span>' : '') +
      '<button class="btn primary wide" type="button" data-acc="' + act + '">Оставить это</button>' +
      '</div>';

    body.innerHTML =
      '<p class="acc-muted acc-conflict-lead">На этом устройстве и в облаке разный прогресс. Выбери, что оставить — второе сохранение будет заменено.</p>' +
      card('На этом устройстве', local, 'keep-local', '') +
      card('В облаке', cloud, 'keep-cloud', '') +
      '<p class="acc-foot">Если не уверен — оставь то, где больше скрапа и уровень выше.</p>';
  }


  function applyCloud(row) {
    try {
      const ok = window.BC_GAME && window.BC_GAME.applyExternalSave && window.BC_GAME.applyExternalSave(row.data);
      if (ok) {
        lastPushSig = stateSig(row.data);
        toast('Загружено облачное сохранение', 'good');
        lastSyncAt = Date.now();
        cloudState = 'ok';
        cloudError = '';
        refreshSyncUi();
        return true;
      }
    } catch (e) {}
    cloudState = 'error';
    cloudError = 'не удалось применить сохранение';
    refreshSyncUi();
    return false;
  }

  /* Отпечаток прогресса: чтобы не гонять в облако одинаковые сохранения.
     Игра пишет localStorage каждые 3 секунды, поэтому таймер нельзя
     перезапускать при каждом сохранении — иначе он не сработает никогда. */
  function stateSig(st) {
    if (!st) return '';
    let barrels = 0;
    for (const k in st.barrels || {}) barrels += Number(st.barrels[k]) || 0;
    let upgrades = 0;
    for (const k in st.upgrades || {}) upgrades += Number(st.upgrades[k]) || 0;
    const field = Array.isArray(st.field) ? st.field.filter(Boolean).length : 0;
    return [
      Math.floor(Number(st.totalScrap) || 0),
      Math.floor(Number(st.scrap) || 0),
      Number(st.level) || 1,
      upgrades,
      barrels,
      field,
      Number(st.goldenScrap) || 0,
      Number(st.stars) || 0,
      Number(st.magnets) || 0,
    ].join('|');
  }

  function schedulePush() {
    if (!session || !cloudReady || pushTimer) return;
    const wait = Math.max(PUSH_DEBOUNCE, PUSH_MIN_INTERVAL - (Date.now() - lastPushAt));
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushNow('auto');
    }, wait);
  }

  async function pushNow(reason) {
    if (!session || !cloudReady) return false;
    if (pushInFlight) {
      pushQueued = true;
      return false;
    }

    const state = (window.BC_GAME && window.BC_GAME.getState && window.BC_GAME.getState()) || null;
    if (!state) return false;

    const sig = stateSig(state);
    if (reason === 'auto' && sig === lastPushSig) return false;

    pushInFlight = true;
    cloudState = 'syncing';
    refreshSyncUi();

    try {
      const now = new Date().toISOString();
      const payload = JSON.parse(JSON.stringify(state));
      const uid = session.user.id;

      const { error } = await sb.from('saves').upsert(
        { user_id: uid, data: payload, updated_at: now },
        { onConflict: 'user_id' },
      );
      if (error) throw error;

      if (profile && profile.nickname) {
        const { error: boardErr } = await sb.from('leaderboard').upsert(
          {
            user_id: uid,
            nickname: profile.nickname,
            total_scrap: Math.max(0, Math.floor(Number(state.totalScrap) || 0)),
            level: Math.max(1, Math.floor(Number(state.level) || 1)),
            updated_at: now,
          },
          { onConflict: 'user_id' },
        );
        if (boardErr) console.warn('Рейтинг не обновился', boardErr);
      }

      lastPushAt = Date.now();
      lastSyncAt = lastPushAt;
      lastPushSig = sig;
      cloudState = 'ok';
      cloudError = '';
      refreshSyncUi();
      return true;
    } catch (err) {
      cloudState = 'error';
      cloudError = humanError(err);
      refreshSyncUi();
      if (reason === 'manual') toast('Не удалось синхронизировать: ' + cloudError, 'bad');
      return false;
    } finally {
      pushInFlight = false;
      if (pushQueued) {
        pushQueued = false;
        schedulePush();
      }
    }
  }

  async function loadLeaderboard() {
    const board = body.querySelector('[data-board]');
    if (!board) return;
    board.innerHTML = '<p class="acc-muted">Загружаю рейтинг…</p>';
    try {
      const { data, error } = await sb
        .from('leaderboard')
        .select('nickname,total_scrap,level')
        .order('total_scrap', { ascending: false })
        .limit(50);
      if (error) throw error;

      if (!data || !data.length) {
        board.innerHTML = '<p class="acc-muted">Пока пусто. Стань первым в рейтинге!</p>';
        return;
      }

      const mine = profile && profile.nickname ? profile.nickname.toLowerCase() : '';
      board.innerHTML =
        '<ol class="acc-board-list">' +
        data
          .map((row, i) => {
            const isMine = mine && String(row.nickname).toLowerCase() === mine;
            return (
              '<li' + (isMine ? ' class="mine"' : '') + '>' +
              '<span class="acc-rank">' + (i + 1) + '</span>' +
              '<b>' + esc(row.nickname) + '</b>' +
              '<span class="acc-board-scrap">' + fmt(row.total_scrap) + ' скрапа</span>' +
              '<span class="acc-board-level">ур. ' + fmt(row.level) + '</span>' +
              '</li>'
            );
          })
          .join('') +
        '</ol>';
    } catch (err) {
      board.innerHTML = '<p class="acc-error">' + esc(humanError(err)) + '</p>';
    }
  }

  /* ------------------------------------------------------------ выход */

  async function doLogout() {
    if (!confirm('Выйти из аккаунта? Прогресс останется на этом устройстве.')) return;

    setBusy(true);
    try {
      if (session && cloudReady) await pushNow('logout');
    } catch (e) {}
    try {
      await sb.auth.signOut();
    } catch (e) {}

    session = null;
    profile = null;
    cloudReady = false;
    bootSyncDone = false;
    cloudState = 'idle';
    lastSyncAt = 0;
    lastPushSig = '';
    clearTimeout(pushTimer);
    pushTimer = null;
    pendingEmail = '';
    pendingPassword = '';
    try {
      localStorage.setItem(MODE_KEY, 'guest');
      localStorage.removeItem(PROFILE_KEY);
    } catch (e) {}

    renderGuest();
    updateChrome();
    setBusy(false);
    toast('Вы вышли из аккаунта', 'good');
  }

  /* ------------------------------------------------------------ события */

  accountBtn.addEventListener('click', () => openSheet());
  accountRowBtn.addEventListener('click', () => {
    const more = document.getElementById('moreSheet');
    if (more) more.hidden = true;
    openSheet();
  });
  closeBtn.addEventListener('click', closeSheet);
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) closeSheet();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !sheet.hidden) closeSheet();
  });

  onboard.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-acc]');
    if (!btn) return;
    const act = btn.dataset.acc;
    try {
      localStorage.setItem(ONBOARD_KEY, '1');
    } catch (e) {}

    if (act === 'guest') {
      try {
        localStorage.setItem(MODE_KEY, 'guest');
      } catch (e) {}
      onboard.hidden = true;
      updateChrome();
      return;
    }

    onboard.hidden = true;
    openSheet(act === 'register' ? 'register' : 'login');
  });

  body.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-acc]');
    if (!btn || busy) return;
    const act = btn.dataset.acc;

    if (act === 'register') setView('register');
    else if (act === 'login') setView('login');
    else if (act === 'back') {
      if (session) setView('account');
      else if (pendingMode === 'signup') setView('register');
      else if (pendingMode === 'login') setView('login');
      else setView('guest');
    }
    else if (act === 'resend') doResend();
    else if (act === 'sync') {
      if (!cloudReady) {
        bootSyncDone = false;
        syncAfterLogin();
        toast('Пробую подключиться к облаку…', 'good');
      } else {
        pushNow('manual').then((ok) => {
          if (ok) toast('Синхронизировано', 'good');
        });
      }
    } else if (act === 'leaderboard') setView('leaderboard');
    else if (act === 'leader-refresh') loadLeaderboard();
    else if (act === 'account') setView('account');
    else if (act === 'keep-local') {
      conflictCloud = null;
      cloudReady = true;
      cloudState = 'syncing';
      pushNow('conflict-local').then(() => setView('account'));
    } else if (act === 'keep-cloud') {
      const row = conflictCloud;
      conflictCloud = null;
      if (row && applyCloud(row)) {
        cloudReady = true;
        setView('account');
      }
    } else if (act === 'logout') doLogout();
  });

  body.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    if (busy) return;
    const kind = form.dataset.form;
    if (kind === 'register') doRegister(form);
    else if (kind === 'login') doLogin(form);
    else if (kind === 'code') doVerifyCode(form);
  });

  /* ------------------------------------------------------------ старт */

  function readCachedProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p && p.nickname ? p : null;
    } catch (e) {
      return null;
    }
  }

  let authStarted = false;

  async function startAuth() {
    if (authStarted || !sb) return;
    authStarted = true;

    try {
      const { data } = await sb.auth.getSession();
      session = (data && data.session) || null;
    } catch (e) {
      session = null;
    }

    if (session) {
      profile = readCachedProfile();
      updateChrome();
      try {
        profile = await fetchProfile();
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      } catch (e) {}
      updateChrome();
    }

    sb.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        session = null;
        profile = null;
        cloudReady = false;
        bootSyncDone = false;
        if (!sheet.hidden) renderGuest();
        updateChrome();
      } else if (nextSession && event === 'SIGNED_IN' && !session) {
        session = nextSession;
        completeLogin(nextSession, '');
      }
    });

    if (session) syncAfterLogin();
  }

  async function boot() {
    updateChrome();

    if (configured && sb) await startAuth();

    /* если конфига ещё нет — не блокируем игру, экран аккаунта сам попробует
       подтянуть конфиг при открытии */
    setTimeout(() => maybeShowOnboard(), 2100);
  }

  window.BC_ACCOUNT = {
    onSave: function () {
      if (!session || !cloudReady) return;
      schedulePush();
    },
    open: function () {
      openSheet();
    },
    sync: function () {
      cloudReady = true;
      return pushNow('manual');
    },
    state: function () {
      return {
        loggedIn: !!session,
        nickname: profile && profile.nickname,
        cloudState: cloudState,
        cloudReady: cloudReady,
        lastSyncAt: lastSyncAt,
      };
    },
  };

  boot();
})();
