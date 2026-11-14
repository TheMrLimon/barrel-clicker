/* Barrel Clicker — ИИ-помощник по игре.
   Отвечает по встроенной базе знаний: без интернета, ключей и запросов к серверу. */
(() => {
  'use strict';

  /* ---------------------------------------------------------------- база */

  const LINK = {
    play: '<a href="play/">открыть игру в браузере</a>',
    download: '<a href="#download">скачать exe</a>',
    start: '<a href="#start">инструкция по запуску</a>',
    mobile: '<a href="#mobile">установка на телефон</a>',
    versions: '<a href="#versions">все версии</a>',
    faq: '<a href="#faq">FAQ</a>',
    screens: '<a href="#screens">скриншоты</a>',
    upgrades: '<a href="#features">возможности игры</a>',
  };

  const TOPICS = [
    {
      id: 'play',
      title: 'Как играть',
      keys: ['как играть', 'что делать', 'правила', 'механика', 'слиян', 'соедин', 'бочк', 'поле', 'клик', 'тащ'],
      answer:
        'Бочки сами появляются на поле 8×4. Соединяй одинаковые — тапом по двум или перетаскиванием одной на другую. ' +
        'Новая бочка приносит больше скрапа, чем две старые, поэтому поле лучше держать заполненным. ' +
        'Ненужное отправляй в мусоропровод справа. Подробнее — в разделе «' + LINK.upgrades + '».',
      chips: ['Что такое скрап?', 'Как работает авто слияние?', 'С чего начать?'],
    },
    {
      id: 'start-tips',
      title: 'С чего начать',
      keys: ['с чего начать', 'нович', 'совет', 'первые', 'старт', 'быстрее', 'прогресс'],
      answer:
        'Три правила новичка:<br>1. Сливай бочки сразу, как появилась пара — пустое поле генерирует бочки быстрее.<br>' +
        '2. Первые улучшения бери дешёвые: «Скорость появления» и «Доход поля» окупаются за минуты.<br>' +
        '3. Лови магниты — они падают сверху каждые 5 минут, за 10 🧲 можно вызвать шторм вручную.',
      chips: ['Как работает престиж?', 'Что дают улучшения?', 'Как ловить магниты?'],
    },
    {
      id: 'scrap',
      title: 'Скрап',
      keys: ['скрап', 'валюта', 'деньги', 'доход', 'заработать', 'доход в секунду', 'пассив'],
      answer:
        'Скрап — основная валюта. Его дают бочки: каждая приносит доход в секунду, а чем выше уровень, тем больше доход. ' +
        'За скрап покупаются бочки и улучшения. Второй слой прогресса — золотой скрап, он получается за престиж и даёт постоянный множитель.',
      chips: ['Как работает престиж?', 'Что дают улучшения?', 'Что такое офлайн-доход?'],
    },
    {
      id: 'auto-merge',
      title: 'Авто слияние',
      keys: ['!авто слиян', '!автоматическ', '!само слива', 'автомерж', 'авто-слиян'],
      answer:
        '«Авто слияние» — улучшение из магазина, появилось в версии 2.3. Оно само сливает одинаковые пары: 5 уровней, ' +
        'интервал уменьшается с 10 до 6 секунд, цена растёт от 1 M до 1 Qi скрапа. Включается сразу после покупки — отдельной кнопки нет.',
      chips: ['Что дают улучшения?', 'Где купить улучшение?'],
    },
    {
      id: 'upgrades',
      title: 'Улучшения',
      keys: ['улучшен', 'прокач', 'магазин', 'куп', 'буст', 'множител'],
      answer:
        'В игре 17 улучшений: скорость появления, доход поля, множитель, шанс магнита, шанс двойной бочки, размер поля, ' +
        'офлайн-доход и другие. Кнопку можно зажать — покупки пойдут пачкой каждые 0,085 с. ' +
        'Цена следующего уровня видна прямо на карточке.',
      chips: ['Как работает авто слияние?', 'Что делает «Больше — лучше»?'],
    },
    {
      id: 'field',
      title: 'Размер поля',
      keys: ['размер поля', 'клетк', 'больше лучше', 'больше — лучше', 'расшир'],
      answer:
        'Стартовое поле — 8×4 (32 клетки). Улучшение «Больше — лучше» расширяет его до 37 клеток: каждая покупка добавляет клетки, ' +
        'всего 5 уровней. Больше места — больше бочек — больше дохода.',
      chips: ['Как играть?', 'Что дают улучшения?'],
    },
    {
      id: 'storm',
      title: 'Магнитный шторм',
      keys: ['!шторм', '!магнит', 'падает', 'поймать', 'ловить'],
      answer:
        'Каждые 5 минут сверху падают магниты — успей поймать. За 10 🧲 можно вызвать шторм вручную кнопкой «Вызвать». ' +
        'В магнитном магазине 5 постоянных улучшений за магниты: от 300 штук. Магнитный шторм — отдельная валюта, скрапом его не купить.',
      chips: ['Что даёт магнитный магазин?', 'Как играть?'],
    },
    {
      id: 'magnet-shop',
      title: 'Магнитный магазин',
      keys: ['магнитный магазин', 'потратить магнит', 'за магнит', 'магнитн'],
      answer:
        'Магнитный магазин открывается на вкладке «Магнит». Там 5 постоянных улучшений за 🧲 — они не сбрасываются престижем и работают всегда. ' +
        'Первое стоит 300 магнитов, дальше дороже.',
      chips: ['Как ловить магниты?', 'Что такое престиж?'],
    },
    {
      id: 'prestige',
      title: 'Престиж и звёзды',
      keys: ['!престиж', '!перезапуск', '!звезд', 'звёзд', 'золот', 'сброс', 'множител'],
      answer:
        'Престиж — добровольный перезапуск забега. Ты теряешь бочки и скрап, но получаешь золотой скрап, а он даёт постоянный множитель дохода. ' +
        'Звёзды: до 10 штук, каждая +10% к доходу. Престиж доступен, когда накоплен нужный объём скрапа (видно на вкладке «Престиж»). ' +
        'Улучшения за магниты и золотой скрап сохраняются.',
      chips: ['Как получить звёзды?', 'Что даёт золотой скрап?', 'Когда делать престиж?'],
    },
    {
      id: 'golden',
      title: 'Золотой скрап',
      keys: ['золотой скрап', 'голден', 'golden', 'золот'],
      answer:
        'Золотой скрап начисляется за престиж и не тратится. Он даёт постоянный процент к доходу — чем больше забегов, тем выше множитель. ' +
        'Каждые 100 золотого скрапа добавляют ещё процент, максимум считается автоматически.',
      chips: ['Как работает престиж?', 'Сколько звёзд максимум?'],
    },
    {
      id: 'offline',
      title: 'Офлайн-доход',
      keys: ['!офлайн', '!offline', '!ночью', 'пока не игра', 'закрыта', 'накоплен', 'пока меня нет'],
      answer:
        'Пока игра закрыта, бочки продолжают работать. База — 2 часа офлайн-дохода, улучшения продлевают это время. ' +
        'При возвращении игра показывает, сколько накопилось, и начисляет сразу. Работает и в exe, и на телефоне.',
      chips: ['Что дают улучшения?', 'Где хранится прогресс?'],
    },
    {
      id: 'trash',
      title: 'Мусоропровод',
      keys: ['мусор', 'утиль', 'выброс', 'удалить бочк', 'избавит'],
      answer:
        'Мусоропровод — тёмная клетка справа от поля. Перетащи туда ненужную бочку, и она исчезнет. ' +
        'Счётчик выброшенных бочек виден в статистике.',
      chips: ['Как играть?', 'Как расширить поле?'],
    },
    {
      id: 'levels',
      title: '512 уровней',
      keys: ['512', 'уровн', 'уровней', 'материал', 'ранг', 'сингулярн', 'тир'],
      answer:
        'Всего 512 уровней бочек: 12 ручных (деревянная, железная, золотая…) и 500 сгенерированных, вплоть до сингулярности. ' +
        '20 рангов и 25 материалов, у каждого свой цвет. В магазине бочек есть поиск и кнопка «К текущему».',
      chips: ['Как купить бочку?', 'Что дают улучшения?'],
    },
    {
      id: 'buy-barrels',
      title: 'Магазин бочек',
      keys: ['купить бочк', 'магазин бочек', 'цена бочк', 'x10', 'пачк'],
      answer:
        'На вкладке «Бочки» видно все 512 уровней. Купить можно по одной или ×10 — пачкой дешевле за штуку. ' +
        'Открытые уровни подсвечены, следующие показывают цену. Кнопка «К текущему» прокручивает к твоему уровню.',
      chips: ['Как играть?', 'Сколько всего уровней?'],
    },
    {
      id: 'download',
      title: 'Скачивание и запуск',
      keys: ['скачат', 'скач', 'запуст', 'exe', 'windows', 'виндовс', 'файл', '67'],
      answer:
        'Нажми «' + LINK.download + '» — это один файл BarrelClicker.exe весом 67,0 МБ. Внутри уже есть .NET-рантайм и сама игра, ' +
        'ничего доустанавливать не нужно. Двойной клик — и играешь. Подробности в разделе «' + LINK.start + '».',
      chips: ['Почему Windows предупреждает?', 'Нужен ли интернет?', 'Есть версия на телефон?'],
    },
    {
      id: 'smartscreen',
      title: 'Предупреждение Windows',
      keys: ['smartscreen', 'предупрежд', 'антивирус', 'защитник', 'вирус', 'не подписан', 'подробнее'],
      answer:
        'Файл не подписан платным сертификатом, поэтому SmartScreen показывает предупреждение для любого неподписанного .exe. ' +
        'Нажми «Подробнее» → «Выполнить в любом случае». Игра работает полностью локально: ничего не отправляет и не скачивает. ' +
        'Хеш файла можно сверить в блоке «SHA-256» на странице скачивания.',
      chips: ['Что внутри exe?', 'Нужен ли интернет?'],
    },
    {
      id: 'requirements',
      title: 'Системные требования',
      keys: ['требован', 'windows 10', 'windows 11', 'оператив', 'место', '64', 'webview', 'слабый пк'],
      answer:
        'Нужны Windows 10 или 11, 64-bit и около 200 МБ на диске. Интернет не требуется. ' +
        'Игра использует WebView2 — он уже входит в Windows 10/11 вместе с Edge, отдельно ставить не нужно.',
      chips: ['Как скачать?', 'Нужен ли интернет?'],
    },
    {
      id: 'mobile',
      title: 'Телефон и установка',
      keys: [
        '!телефон',
        '!установ',
        '!мобильн',
        'андроид',
        'android',
        'iphone',
        'айфон',
        'айпад',
        'ipad',
        'pwa',
        'на домашний',
        'safari',
        'chrome',
      ],
      answer:
        'Да, есть версия для телефона — та же игра в браузере. Android: открой ' + LINK.play + ' в Chrome → «Ещё» → «Установить на телефон». ' +
        'iPhone/iPad: открой игру в Safari → «Поделиться» → «На экран „Домой“». После первого запуска работает офлайн. ' +
        'Пошагово: ' + LINK.mobile + '.',
      chips: ['Можно перенести прогресс?', 'Нужен ли интернет?'],
    },
    {
      id: 'save',
      title: 'Сохранения и перенос',
      keys: ['!сохран', '!перенес', '!перенос', '!пропал', '!хранит', 'прогресс', 'бэкап', 'экспорт', 'импорт', 'сброс'],
      answer:
        'В exe прогресс лежит в <code>%LOCALAPPDATA%\\BarrelClicker\\profile\\</code>, сохранение автоматическое. ' +
        'В браузере и на телефоне — в localStorage. Перенести можно через «Ещё» → экспорт/импорт: выгрузи файл на одном устройстве и загрузи на другом. ' +
        'С аккаунтом прогресс дополнительно хранится в облаке и сам подтягивается на другом устройстве. ' +
        'Если удалить папку профиля или очистить данные браузера, гостевой прогресс начнётся заново.',
      chips: ['Зачем аккаунт?', 'Где хранится прогресс?'],
    },
    {
      id: 'internet',
      title: 'Интернет',
      keys: ['интернет', 'онлайн', 'сеть', 'без сети', 'wifi', 'вайфай'],
      answer:
        'Интернет не нужен: exe работает полностью локально, PWA после первого запуска кэшируется и тоже работает офлайн. ' +
        'Сеть понадобится только чтобы скачать игру, обновить её до новой версии или войти в аккаунт.',
      chips: ['Как скачать?', 'Как обновиться?'],
    },
    {
      id: 'free',
      title: 'Бесплатно и без рекламы',
      keys: [
        '!сколько',
        '!стоит',
        '!стоимость',
        '!цена',
        '!бесплат',
        'платн',
        'реклам',
        'донат',
        'покупк',
        'подписк',
        'регистрац',
      ],
      answer:
        'Игра полностью бесплатная: без рекламы, встроенных покупок и подписок. ' +
        'Аккаунт тоже бесплатный и необязательный — он нужен только для облачного сохранения и рейтинга.',
      chips: ['Что внутри exe?', 'Кто сделал игру?'],
    },
    {
      id: 'size',
      title: 'Что внутри exe',
      keys: ['!что внутри', '!размер', '!вес', '!занимает', '67', 'почему так много'],
      answer:
        '67 МБ — это сама игра плюс .NET-рантайм и WebView2-обвязка, чтобы ничего не устанавливать. ' +
        'Код игры защищён: внутри лежит только обфусцированная сборка, читаемых скриптов нет.',
      chips: ['Нужны ли права администратора?', 'Как скачать?'],
    },
    {
      id: 'account',
      title: 'Аккаунт и облако',
      keys: ['!аккаунт', '!регистрац', '!войти', '!вход', '!пароль', '!почта', '!код', 'облак', 'рейтинг', 'ник'],
      answer:
        'Первый запуск предлагает три варианта: играть как гость, создать аккаунт или войти. ' +
        'Регистрация: ник, почта и пароль, затем 8-значный код из письма. Вход: ник и пароль, потом код на привязанную почту. ' +
        'Забыли пароль — на экране входа есть «Забыли пароль?»: придёт код на почту, после него задаёшь новый пароль. ' +
        'Аккаунт даёт облачное сохранение и рейтинг игроков (рейтинг виден и без входа). Без аккаунта всё работает как раньше — прогресс хранится на устройстве.',
      chips: ['Забыл пароль, что делать?', 'Где хранится прогресс?'],
    },
    {
      id: 'password',
      title: 'Забыл пароль',
      keys: ['!забыл', '!восстанов', '!сброс', 'сменить пароль', 'новый пароль', 'не помню парол'],
      answer:
        'На экране входа нажми <b>«Забыли пароль?»</b>, введи почту, привязанную к аккаунту, и код из письма. ' +
        'После кода игра попросит новый пароль — и сразу войдёт в аккаунт. ' +
        'Если почта не пришла, проверь «Спам» и попробуй ещё раз через минуту. Ник и прогресс при сбросе не меняются.',
      chips: ['Что такое аккаунт?', 'Нужен ли интернет?'],
    },
    {
      id: 'sound',
      title: 'Звук и эффекты',
      keys: ['!звук', '!музык', '!тихо', '!громк', 'выключить звук', 'эффект', 'анимац'],
      answer:
        'Звук и эффекты отключаются кнопкой 🔊 в шапке игры — состояние запоминается. ' +
        'Если звука нет, проверь, что вкладка не в режиме «без звука» и что браузер не блокирует автозапуск аудио: хватит одного клика по игре.',
      chips: ['Игра тормозит', 'Как играть?'],
    },
    {
      id: 'bug',
      title: 'Игра не работает',
      keys: ['!не работает', '!не запускает', '!белый экран', '!черный экран', '!тормоз', '!лаг', 'ошибк', 'краш', 'вылет', 'завис', 'фриз', 'не открывается'],
      answer:
        'По порядку:<br>1. Перезапусти игру (в браузере — с Ctrl+F5, чтобы сбросить кэш).<br>' +
        '2. Проверь, что файл докачался: размер 67,0 МБ и SHA-256 совпадает с указанным на сайте.<br>' +
        '3. Если Windows блокирует запуск — «Подробнее» → «Выполнить в любом случае».<br>' +
        '4. На слабом ПК закрой лишние вкладки: игра рисует эффекты на canvas.<br>' +
        'Если не помогло — напиши, что именно происходит (версия, Windows, текст ошибки), и я подскажу дальше.',
      chips: ['Почему Windows предупреждает?', 'Где взять старую версию?'],
    },
    {
      id: 'versions',
      title: 'Версии и обновления',
      keys: ['!верси', '!обнов', '!релиз', 'старая версия', 'что нового', 'changelog', '2.8', '2.7', '2.6'],
      answer:
        'Все версии от 1.0 до актуальной собраны в разделе «' + LINK.versions + '» — с датами, изменениями и ссылками на exe. ' +
        'Обновление ставится поверх: скачай новый exe и запусти, прогресс сохранится. В браузере и на телефоне обновление приходит само ' +
        '(иногда нужно перезагрузить страницу дважды).',
      chips: ['Что нового в 2.8?', 'Где скачать старую версию?'],
    },
    {
      id: 'code',
      title: 'Код игры',
      keys: ['исходник', 'код', 'скрипт', 'js', 'открыть код', 'посмотреть код', 'обфускац', 'защит', 'devtools'],
      answer:
        'Код игры не публикуется: он собирается в один обфусцированный файл, где имена, строки и структура закодированы. ' +
        'В игре также отключены правый клик и горячие клавиши DevTools. Это защита от копирования, а не от взлома — ' +
        'локальную игру всё равно можно «подкрутить» через сохранение, но исходников там нет.',
      chips: ['Можно ли играть офлайн?', 'Кто сделал игру?'],
    },
    {
      id: 'author',
      title: 'Кто сделал игру',
      keys: ['кто сделал', 'автор', 'разработчик', 'создател', 'контакт', 'поддержк', 'связаться'],
      answer:
        'Barrel Clicker — небольшой независимый проект: HTML/CSS/JS, упакованный в Windows-приложение. ' +
        'Отзывы и сообщения об ошибках можно оставить в GitHub-репозитории проекта — ссылка есть в подвале сайта.',
      chips: ['Как играть?', 'Все версии'],
    },
    {
      id: 'privacy',
      title: 'Данные и приватность',
      keys: ['данные', 'приватн', 'следит', 'отправляет', 'трекер', 'cookie', 'персональн'],
      answer:
        'Без аккаунта игра не отправляет в сеть ничего: нет аналитики, трекеров и рекламы, прогресс хранится только на устройстве. ' +
        'Если создать аккаунт, на сервер уходят ник, почта и сохранение — только для входа, облака и рейтинга. Сайт — статическая страница на GitHub Pages.',
      chips: ['Нужен ли интернет?', 'Где хранится прогресс?'],
    },
    {
      id: 'admin',
      title: 'Секретная панель',
      keys: ['!админ', '!секрет', '!чит', 'пароль', 'панель'],
      answer:
        'В игре есть скрытая панель для быстрой проверки механик: десять быстрых кликов по логотипу 🛢️ в левом верхнем углу. ' +
        'Она нужна разработчику, обычной игре не требуется — прогресс и так сохраняется.',
      chips: ['Как играть?', 'Что дают улучшения?'],
    },
  ];

  const GREETINGS = {
    hello: 'Привет! Я помощник Barrel Clicker. Спроси что угодно про игру — слияние, престиж, магниты, установку на телефон или запуск на Windows.',
    thanks: 'Всегда пожалуйста! Если появятся ещё вопросы — пиши.',
    bye: 'Удачной охоты за скрапом! Возвращайся, если что-то будет непонятно.',
  };

  const HINTS = [
    'Как играть?',
    'Как установить на телефон?',
    'Где скачать игру?',
    'Как работает престиж?',
    'Почему Windows предупреждает?',
    'Как работает авто слияние?',
  ];

  /* ------------------------------------------------------------- разбор */

  const norm = (text) =>
    String(text || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^0-9a-zа-я\s+]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const WORDS = {
    hello: ['привет', 'здравств', 'хай', 'добрый день', 'добрый вечер', 'доброе утро', 'йо', 'как дела', 'как ты'],
    thanks: ['спасибо', 'спс', 'благодар', 'круто', 'супер', 'понял', 'ясно'],
    bye: ['пока', 'до свидания', 'бывай'],
  };

  function scoreTopic(topic, q, tokens) {
    let score = 0;

    for (const rawKey of topic.keys) {
      const strong = rawKey.startsWith('!');
      const k = norm(strong ? rawKey.slice(1) : rawKey);
      if (k.length < 3) continue;

      if (q.includes(k)) {
        score += strong ? 9 : k.includes(' ') ? 6 : k.length >= 7 ? 4 : 3;
        continue;
      }

      if (k.length < 5) continue;

      for (const token of tokens) {
        if (token.length < 4) continue;
        if (token.startsWith(k.slice(0, 5)) || k.startsWith(token.slice(0, 5))) {
          score += strong ? 5 : 2;
          break;
        }
      }
    }

    return score;
  }

  function reply(text) {
    const raw = String(text || '').trim();
    const q = norm(raw);
    if (!q) return { kind: 'empty' };

    for (const [kind, words] of Object.entries(WORDS)) {
      if (words.some((w) => q === w || q.startsWith(w + ' ') || (q.length <= 22 && q.includes(w)))) {
        if (kind === 'hello' && q.length > 24) break;
        return { kind, text: GREETINGS[kind], chips: kind === 'hello' ? HINTS.slice(0, 3) : [] };
      }
    }

    const tokens = q.split(' ').filter(Boolean);
    let best = null;
    let bestScore = 0;
    const ranked = [];

    for (const topic of TOPICS) {
      const score = scoreTopic(topic, q, tokens);
      if (score > 0) ranked.push({ topic, score });
      if (score > bestScore) {
        best = topic;
        bestScore = score;
      }
    }

    if (best && bestScore >= 2) {
      return { kind: 'topic', text: best.answer, chips: best.chips || [], topic: best.id };
    }

    ranked.sort((a, b) => b.score - a.score);
    const suggestions = ranked.slice(0, 3).map((r) => r.topic.title);
    const chips = suggestions.length ? suggestions : HINTS.slice(0, 3);

    return {
      kind: 'fallback',
      text:
        'Точного ответа в базе нет. Могу рассказать про: слияние, престиж, магниты, улучшения, установку на телефон, ' +
        'запуск на Windows или сохранения. Ещё есть раздел «' + LINK.faq + '» и «' + LINK.versions + '». ' +
        'Пиши вопрос своими словами — попробую найти подходящее.',
      chips,
    };
  }

  /* ---------------------------------------------------------------- UI */

  if (document.querySelector('.support')) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.createElement('div');
  root.className = 'support';
  root.innerHTML = `
    <button class="support-fab" type="button" aria-expanded="false" aria-controls="supportPanel">
      <span class="support-fab-ico" aria-hidden="true">💬</span>
      <span class="support-fab-text">Поддержка</span>
      <span class="support-fab-dot" aria-hidden="true"></span>
    </button>

    <section class="support-panel" id="supportPanel" role="dialog" aria-modal="false" aria-label="ИИ-помощник Barrel Clicker" hidden>
      <header class="support-head">
        <span class="support-avatar" aria-hidden="true">🛢️</span>
        <div class="support-title">
          <b>Помощник Barrel Clicker</b>
          <span><i class="support-online" aria-hidden="true"></i> отвечает сразу, работает офлайн</span>
        </div>
        <button class="support-close" type="button" aria-label="Закрыть чат">✕</button>
      </header>

      <div class="support-log" id="supportLog" role="log" aria-live="polite" aria-label="Переписка с помощником"></div>

      <div class="support-chips" id="supportChips"></div>

      <form class="support-form" id="supportForm" autocomplete="off">
        <input class="support-input" id="supportInput" type="text" name="q" placeholder="Спроси про игру…" maxlength="300" aria-label="Вопрос помощнику">
        <button class="support-send" type="submit" aria-label="Отправить">↑</button>
      </form>

      <p class="support-foot">Отвечает по базе знаний игры. ИИ-модель не используется, данные никуда не уходят.</p>
    </section>
  `;
  document.body.appendChild(root);

  const fab = root.querySelector('.support-fab');
  const panel = root.querySelector('.support-panel');
  const log = root.querySelector('#supportLog');
  const chipsEl = root.querySelector('#supportChips');
  const form = root.querySelector('#supportForm');
  const input = root.querySelector('#supportInput');
  const closeBtn = root.querySelector('.support-close');

  const MAX_MESSAGES = 40;
  let opened = false;
  let typingEl = null;

  function scrollLog() {
    log.scrollTop = log.scrollHeight;
  }

  function addMessage(role, html, withAvatar) {
    const row = document.createElement('div');
    row.className = 'support-msg support-msg-' + role;

    if (withAvatar) {
      const avatar = document.createElement('span');
      avatar.className = 'support-msg-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = role === 'bot' ? '🛢️' : '🙂';
      row.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'support-bubble';
    bubble.innerHTML = html;
    row.appendChild(bubble);

    log.appendChild(row);

    while (log.children.length > MAX_MESSAGES) log.removeChild(log.firstElementChild);

    scrollLog();
    return bubble;
  }

  function setChips(items) {
    chipsEl.innerHTML = '';
    if (!items || !items.length) {
      chipsEl.hidden = true;
      return;
    }
    chipsEl.hidden = false;
    for (const item of items) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'support-chip';
      chip.textContent = item;
      chip.addEventListener('click', () => send(item));
      chipsEl.appendChild(chip);
    }
  }

  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement('div');
    typingEl.className = 'support-msg support-msg-bot support-typing';
    typingEl.innerHTML = '<span class="support-msg-avatar" aria-hidden="true">🛢️</span><div class="support-bubble"><i></i><i></i><i></i></div>';
    log.appendChild(typingEl);
    scrollLog();
  }

  function hideTyping() {
    if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function send(text) {
    const value = String(text || '').trim();
    if (!value) return;

    addMessage('user', escapeHtml(value), true);
    input.value = '';
    setChips([]);

    const result = reply(value);
    const answer = result.kind === 'empty' ? 'Напиши вопрос — например, «как играть» или «как установить на телефон».' : result.text;

    showTyping();
    const delay = reduceMotion ? 120 : Math.min(900, 380 + answer.length / 3);

    window.setTimeout(() => {
      hideTyping();
      addMessage('bot', answer, true);
      setChips(result.chips && result.chips.length ? result.chips : HINTS.slice(0, 2));
    }, delay);
  }

  function openPanel() {
    panel.hidden = false;
    root.classList.add('open');
    fab.setAttribute('aria-expanded', 'true');

    if (!opened) {
      opened = true;
      const hour = new Date().getHours();
      const hi = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

      addMessage(
        'bot',
        `${hi}! Я помощник Barrel Clicker. Отвечаю на вопросы про игру: слияние, престиж, магниты, улучшения, установку на телефон и запуск на Windows.<br>` +
          'Спрашивай словами — например, «как работает авто слияние» или «игра не запускается».',
        true,
      );
      setChips(HINTS.slice(0, 4));
    }

    window.setTimeout(() => {
      if (window.matchMedia('(min-width: 761px)').matches) input.focus({ preventScroll: true });
    }, 180);
  }

  function closePanel() {
    panel.hidden = true;
    root.classList.remove('open');
    fab.setAttribute('aria-expanded', 'false');
    fab.focus({ preventScroll: true });
  }

  fab.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  closeBtn.addEventListener('click', closePanel);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });

  /* ссылки внутри ответов: закрываем чат, чтобы было видно куда перешли */
  log.addEventListener('click', (event) => {
    if (event.target.closest('a') && window.matchMedia('(max-width: 760px)').matches) closePanel();
  });

  /* внешняя кнопка «Поддержка» в подвале */
  document.querySelectorAll('[data-support-open]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      openPanel();
    });
  });

  /* прямая ссылка на чат: site/#support */
  if (window.location.hash === '#support') openPanel();

  window.BC_SUPPORT = { open: openPanel, close: closePanel, topics: TOPICS.length, ask: reply };
})();
