/* Barrel Clicker — site interactions */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- внешняя ссылка на exe (GitHub Releases и т.п.) ---------- */

  const externalDownload = String(window.BC_DOWNLOAD_URL || '').trim();

  if (externalDownload) {
    document.querySelectorAll('a[href="download/BarrelClicker.exe"]').forEach((link) => {
      link.href = externalDownload;
    });
  }

  /* ---------- шапка при прокрутке ---------- */

  const header = document.querySelector('.site-header');
  const onScroll = () => {
    if (header) header.classList.toggle('scrolled', window.scrollY > 8);
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- появление блоков ---------- */

  const revealItems = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && !reduceMotion) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    revealItems.forEach((el) => observer.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add('in'));
  }

  window.__bcSiteReady = true;

  /* ---------- лёгкий наклон окна в hero ---------- */

  const heroWindow = document.getElementById('heroWindow');

  if (heroWindow && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    const stage = heroWindow.closest('.hero-visual');
    let frame = 0;

    stage.addEventListener('pointermove', (event) => {
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = stage.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;

        heroWindow.style.transform =
          'perspective(1400px) rotateY(' + (-4.5 + px * 6).toFixed(2) + 'deg) '
          + 'rotateX(' + (2 - py * 6).toFixed(2) + 'deg) rotate(-1.2deg)';
      });
    });

    stage.addEventListener('pointerleave', () => {
      heroWindow.style.transform = '';
    });
  }

  /* ---------- лайтбокс скриншотов ---------- */

  const shots = Array.from(document.querySelectorAll('.shot'));
  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lbImg');
  const lbCap = document.getElementById('lbCap');
  const lbClose = document.getElementById('lbClose');
  const lbPrev = document.getElementById('lbPrev');
  const lbNext = document.getElementById('lbNext');

  let current = 0;
  let lastFocus = null;
  let closeTimer = 0;

  const canUseLightbox = shots.length && lightbox && lbImg && lbCap;

  function showShot(index) {
    if (!canUseLightbox) return;

    current = (index + shots.length) % shots.length;

    const figure = shots[current];
    const img = figure.querySelector('img');

    lbImg.src = figure.dataset.shot || (img ? img.currentSrc || img.src : '');
    lbImg.alt = img ? img.alt : '';
    lbCap.textContent = figure.dataset.caption || '';
  }

  function openShot(index) {
    if (!canUseLightbox) return;

    clearTimeout(closeTimer);
    lastFocus = document.activeElement;
    showShot(index);

    lightbox.hidden = false;
    document.body.classList.add('lb-open');

    requestAnimationFrame(() => lightbox.classList.add('on'));
    if (lbClose) lbClose.focus({ preventScroll: true });
  }

  function closeShot() {
    if (!canUseLightbox) return;

    lightbox.classList.remove('on');
    document.body.classList.remove('lb-open');

    closeTimer = window.setTimeout(() => {
      lightbox.hidden = true;
      lbImg.removeAttribute('src');
    }, 220);

    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
  }

  if (canUseLightbox) {
    shots.forEach((figure, index) => {
      figure.addEventListener('click', () => openShot(index));

      figure.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openShot(index);
        }
      });
    });

    lbClose.addEventListener('click', closeShot);
    lbPrev.addEventListener('click', () => showShot(current - 1));
    lbNext.addEventListener('click', () => showShot(current + 1));

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) closeShot();
    });

    document.addEventListener('keydown', (event) => {
      if (lightbox.hidden) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closeShot();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showShot(current - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        showShot(current + 1);
      }
    });
  }

  /* ---------- копирование SHA-256 ---------- */

  const shaValue = document.getElementById('shaValue');
  const copyBtn = document.getElementById('copySha');

  if (shaValue && copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = shaValue.textContent.trim();
      let ok = false;

      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (error) {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        area.remove();
      }

      copyBtn.textContent = ok ? 'Скопировано' : 'Не вышло';
      copyBtn.classList.toggle('done', ok);

      window.setTimeout(() => {
        copyBtn.textContent = 'Копировать';
        copyBtn.classList.remove('done');
      }, 2000);
    });
  }
})();
