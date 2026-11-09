// Makes the site feel like an app on iPad, iPhone and other touch devices.
(function () {
  const root = document.documentElement;
  const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  root.classList.toggle('touch', isTouch);
  root.classList.toggle('standalone', standalone);

  // Register the background helper so the site can be installed.
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Keep the layout exactly the size of the visible screen, so the on-screen keyboard
  // pushes the message box up instead of sliding the whole page around.
  const vv = window.visualViewport;
  function fit() {
    const h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--app-h', h + 'px');
    if (window.scrollY) window.scrollTo(0, 0);
  }
  fit();
  (vv || window).addEventListener('resize', fit);
  if (vv) vv.addEventListener('scroll', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 300));

  // No pinch-zoom or double-tap zoom: it should feel like an app, not a web page.
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  // Double-tap zoom is turned off with touch-action in style.css, so quick taps still work.

  // Swipe to open and close the side panels when they are drawers (smaller screens).
  let sx = 0, sy = 0, tracking = false;
  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return (tracking = false);
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      tracking = true;
    },
    { passive: true }
  );
  document.addEventListener(
    'touchend',
    (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      const left = document.getElementById('sideLeft');
      const right = document.getElementById('sideRight');
      const scrim = document.getElementById('scrim');
      if (!left || document.getElementById('app').classList.contains('hidden')) return;
      const isDrawer = (el) => getComputedStyle(el).position === 'fixed';
      const openOne = (el) => {
        el.classList.add('open');
        scrim.classList.add('on');
      };
      const closeAll = () => {
        left.classList.remove('open');
        right.classList.remove('open');
        scrim.classList.remove('on');
      };
      if (left.classList.contains('open') || right.classList.contains('open')) {
        if ((left.classList.contains('open') && dx < 0) || (right.classList.contains('open') && dx > 0)) closeAll();
        return;
      }
      if (document.getElementById('modal').classList.contains('hidden') === false) return;
      if (innerWidth <= 760) return; // phones use the menu instead
      if (dx > 0 && sx < 40 && isDrawer(left)) openOne(left); // swipe in from the left edge
      if (dx < 0 && sx > innerWidth - 40 && isDrawer(right)) openOne(right); // from the right edge
    },
    { passive: true }
  );

  // On iPad/iPhone in Safari, show a small tip on the join screen about adding it to the Home Screen.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let hidden = false;
  try {
    hidden = localStorage.getItem('installTipHidden') === '1';
  } catch {}
  const tip = document.getElementById('installTip');
  if (tip && isIOS && !standalone && !hidden) tip.classList.remove('hidden');
  document.getElementById('installTipClose')?.addEventListener('click', () => {
    tip.classList.add('hidden');
    try {
      localStorage.setItem('installTipHidden', '1');
    } catch {}
  });
})();
