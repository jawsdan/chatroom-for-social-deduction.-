// Background videos behind the chat: a campfire by day, a haunted house by night.
// Both load once; switching phase cross-fades them, and the hidden one is paused.
// Big 16:9 screens (2560x1440 and up) get sharper 1280x720 videos; everyone else the 864x576 ones.
window.SCENE_HD = (function () {
  const dpr = window.devicePixelRatio || 1;
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  return !touch && screen.width * dpr >= 2560 && screen.height * dpr >= 1440;
})();
(function () {
  // Bump this when a video file changes so browsers fetch the new one.
  const VERSION = 4;
  const SUFFIX = window.SCENE_HD ? '-hd' : '';
  // Each game mode has its own day and night videos. The Dark Knight: Gotham rooftops by day, Amusement Mile by night.
  const FILES = { classic: { day: `day${SUFFIX}`, night: `night${SUFFIX}` }, darkknight: { day: 'dk-day', night: 'dk-night' } };
  const videos = {}; // "mode-phase" -> video, made the first time they're needed
  let current = null;
  function make(root, mode, phase) {
    const v = document.createElement('video');
    v.className = `scene-video ${phase} ${mode === 'darkknight' ? 'dk' : ''}`;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    const file = FILES[mode][phase];
    v.poster = `video/${file}-poster.jpg?v=${VERSION}`;
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const src = document.createElement('source');
      src.src = `video/${file}.${ext}?v=${VERSION}`;
      src.type = type;
      v.append(src);
    }
    root.append(v);
    return v;
  }
  window.setScene = function (phase) {
    const root = document.getElementById('scene');
    if (!root) return;
    const mode = window.SCENE_MODE === 'darkknight' ? 'darkknight' : 'classic';
    phase = phase === 'night' ? 'night' : 'day';
    root.classList.toggle('dk', mode === 'darkknight');
    // The live pixel-art scene (default). The videos are only loaded when it's switched off.
    if (window.PixelScene?.enabled()) {
      for (const v of Object.values(videos)) {
        v.classList.remove('on');
        v.pause();
      }
      current = null;
      window.PixelScene.show(root, mode, phase);
      return;
    }
    window.PixelScene?.hide();
    // Load both phases of this mode so switching is instant.
    for (const ph of ['day', 'night']) videos[`${mode}-${ph}`] ||= make(root, mode, ph);
    current = `${mode}-${phase}`;
    for (const [name, v] of Object.entries(videos)) {
      const on = name === current;
      v.classList.toggle('on', on);
      if (on) v.play().catch(() => {});
      else setTimeout(() => !v.classList.contains('on') && v.pause(), 1000); // pause after the fade
    }
    root.classList.toggle('dk', mode === 'darkknight');
  };
  // Browsers pause background videos in hidden tabs; resume when the tab comes back.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && current && videos[current]) videos[current].play().catch(() => {});
  });
})();

// ---------- Characters standing by the fire ----------
// Players who picked a character on the character select screen stand around the fire.
// Spots are in the videos' own pixels (864x576, or 1280x720 for the big-screen videos), mapped onto
// the screen the same way the video is drawn: stretched to fill on computers and iPads,
// cropped (object-fit: cover, anchored at the bottom) on phones.
(function () {
  const HD = window.SCENE_HD;

  const POS_X = { day: 0.5, night: 0.55 }; // matches the videos' object-position on phones
  const els = new Map(); // character id -> element
  let phase = 'day';
  let root = null;

  function place(el, c) {
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    const DK = window.SCENE_MODE === 'darkknight';
    const PIX = !!window.PixelScene?.active;
    // The pixel scene always uses the standard video coordinates (no separate big-screen spots).
    const hd = HD && !PIX;
    const spots = (DK && c.spotDk) || (hd && c.spotHd) || c.spot;
    const spot = spots[phase] || spots.day;
    const baseH = (DK && c.heightDk) || (hd && c.heightHd) || c.height || 138;
    const VIDEO_W = DK || hd ? 1280 : 864;
    const VIDEO_H = DK || hd ? 720 : 576;
    const video = root.querySelector('.scene-video.on') || root.querySelector('.scene-video');
    const stretched = video && getComputedStyle(video).objectFit === 'fill';
    let sx, sy, offX, offY;
    if (stretched) {
      sx = cw / VIDEO_W;
      sy = ch / VIDEO_H;
      offX = 0;
      offY = 0;
    } else if (PIX) {
      // Pixel scene on a phone: the ground is cropped like a video, but the spots are squeezed
      // across the visible width, so everyone keeps their own place.
      sy = Math.max(cw / VIDEO_W, ch / VIDEO_H);
      sx = cw / VIDEO_W;
      offX = 0;
      offY = ch - VIDEO_H * sy;
    } else {
      sx = sy = Math.max(cw / VIDEO_W, ch / VIDEO_H);
      offX = (cw - VIDEO_W * sx) * POS_X[phase];
      offY = ch - VIDEO_H * sy;
    }
    let h = Math.max(80, Math.min(260, baseH * Math.sqrt(sx * sy)));
    // Phones: smaller characters, so a whole group fits side by side.
    if (cw < 600) h = Math.min(h, 92);
    // On narrow screens the video's sides are cropped off, so there is no room beside the fire.
    // Then they stand in front of it instead: lower down, a bit smaller, kept off the message box.
    const wantX = offX + spot.x * sx;
    let y = offY + spot.y * sy;
    // Keep them inside the chat area (the side panels float over the scene on bigger screens).
    const chat = document.querySelector('.chat');
    const sr = root.getBoundingClientRect();
    const cr = chat ? chat.getBoundingClientRect() : sr;
    const minX = cr.left - sr.left;
    const maxX = cr.right - sr.left;
    const half = h * 0.3 + 12;
    let x = Math.min(Math.max(wantX, minX + half), maxX - half);
    const narrowPix = PIX && !stretched;
    if (!narrowPix && Math.abs(x - wantX) > h * 0.15) {
      h = Math.min(h, Math.max(80, (maxX - minX) * 0.26));
      const halfSmall = h * 0.3 + 8;
      x = spots.day.x < VIDEO_W / 2 ? minX + halfSmall : maxX - halfSmall;
      const composer = document.getElementById('composer');
      const cb = composer ? composer.getBoundingClientRect().top - sr.top : ch - 70;
      y = cb - 6;
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--fk-h', h + 'px');
  }
  function placeAll() {
    for (const [id, el] of els) {
      const c = (window.CHARACTERS || []).find((x) => x.id === id);
      if (c) place(el, c);
    }
  }

  // ---------- The pixel village square: everyone stands in a ring around the fire ----------
  const ringEls = new Map(); // player name -> element
  let ringList = [];
  function ringLayout() {
    root = document.getElementById('scene');
    if (!root || !window.PixelScene?.active) return;
    const sr = root.getBoundingClientRect();
    const chat = document.querySelector('.chat');
    const cr = chat ? chat.getBoundingClientRect() : sr;
    const composer = document.getElementById('composer');
    const bottom = (composer ? composer.getBoundingClientRect().top : cr.bottom) - sr.top;
    const head = document.querySelector('.chat-header');
    const top = (head ? head.getBoundingClientRect().bottom : cr.top) - sr.top;
    const left = cr.left - sr.left;
    const width = cr.width;
    const phone = width < 600;
    // The plaza: as wide as the chat allows, flattened like a view from above at an angle.
    const rx = Math.min(width * (phone ? 0.4 : 0.4), (bottom - top) * 0.78);
    const ry = Math.min(rx * 0.56, (bottom - top) * 0.32);
    const cx = left + width / 2;
    const cy = top + (bottom - top) * (phone ? 0.62 : 0.6);
    window.PixelScene.setPlaza(cx, cy, rx, ry);
    const n = ringList.length;
    // Size so neighbours don't overlap: the ring's length shared by everyone.
    const ringLen = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))) * 0.92;
    const h = Math.max(40, Math.min(phone ? 66 : 104, (ringLen / Math.max(n, 6)) * 1.15));
    // Even spacing along the edge of the oval (not by angle, which bunches people up on the sides).
    const steps = 720;
    const cum = [0];
    for (let k = 1; k <= steps; k++) {
      const a0 = Math.PI / 2 + ((k - 1) / steps) * Math.PI * 2;
      const a1 = Math.PI / 2 + (k / steps) * Math.PI * 2;
      cum.push(cum[k - 1] + Math.hypot((Math.cos(a1) - Math.cos(a0)) * rx, (Math.sin(a1) - Math.sin(a0)) * ry));
    }
    const total = cum[steps];
    const angleAt = (frac) => {
      const want = frac * total;
      let k = 0;
      while (k < steps && cum[k + 1] < want) k++;
      return Math.PI / 2 + (k / steps) * Math.PI * 2;
    };
    ringList.forEach((p, i) => {
      const el = ringEls.get(p.name);
      if (!el) return;
      // Start at the bottom so the first players face you; go round evenly.
      const a = angleAt(i / Math.max(n, 1));
      const x = cx + Math.cos(a) * rx * 0.92;
      const y = cy + Math.sin(a) * ry * 0.92;
      const depth = 0.82 + 0.18 * ((Math.sin(a) + 1) / 2); // further back = a little smaller
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.zIndex = String(10 + Math.round(y));
      el.style.setProperty('--fk-h', h * depth + 'px');
    });
  }
  function setRing(list, newPhase) {
    root = document.getElementById('scene');
    if (!root.dataset.ringInit) {
      root.dataset.ringInit = '1';
      window.addEventListener('resize', ringLayout);
      new ResizeObserver(ringLayout).observe(root);
    }
    // Hide the side-view characters while the ring is up.
    for (const el of els.values()) el.remove();
    els.clear();
    ringList = list.filter((p) => !p.mod);
    const names = new Set(ringList.map((p) => p.name));
    for (const [name, el] of ringEls) {
      if (!names.has(name)) {
        el.remove();
        ringEls.delete(name);
      }
    }
    for (const p of ringList) {
      const c = p.character && (window.CHARACTERS || []).find((x) => x.id === p.character);
      const img = c ? c.img : window.PixelScene.personSprite(p.name);
      let el = ringEls.get(p.name);
      const fresh = !el || el.dataset.img !== img;
      if (!el) {
        el = document.createElement('div');
        el.className = 'firekeeper ring';
        el.innerHTML = '<div class="fk-poof"></div><img class="fk-img" alt="" draggable="false"><div class="fk-name"></div>';
        root.append(el);
        ringEls.set(p.name, el);
      }
      el.dataset.img = img;
      el.querySelector('.fk-img').src = img;
      el.classList.toggle('flip', !!c?.flip);
      el.classList.toggle('plain', !c);
      el.querySelector('.fk-name').textContent = p.name;
      el.classList.toggle('dead', !!p.dead);
      if (fresh) {
        el.classList.remove('spawn');
        void el.offsetWidth;
        el.classList.add('spawn');
      }
    }
    ringLayout();
    void newPhase;
  }
  function clearRing() {
    for (const el of ringEls.values()) el.remove();
    ringEls.clear();
    ringList = [];
  }

  // list: [{ name, character, dead, mod }]
  window.setFireCharacters = function (list, newPhase) {
    if (window.PixelScene?.active) return setRing(list, newPhase);
    clearRing();
    root = document.getElementById('scene');
    if (!root) return;
    if (!root.dataset.fkInit) {
      root.dataset.fkInit = '1';
      window.addEventListener('resize', placeAll);
      new ResizeObserver(placeAll).observe(root);
      const chatEl = document.querySelector('.chat');
      if (chatEl) new ResizeObserver(placeAll).observe(chatEl);
    }
    phase = newPhase === 'night' ? 'night' : 'day';
    const wanted = new Map(list.filter((p) => p.character).map((p) => [p.character, p]));
    for (const [id, el] of els) {
      if (!wanted.has(id)) {
        el.remove();
        els.delete(id);
      }
    }
    for (const [id, p] of wanted) {
      const c = (window.CHARACTERS || []).find((x) => x.id === id);
      if (!c) continue;
      let el = els.get(id);
      const fresh = !el || el.dataset.owner !== p.name;
      if (!el) {
        el = document.createElement('div');
        el.className = 'firekeeper' + (c.flip ? ' flip' : '');
        el.innerHTML = `<div class="fk-poof"></div><img class="fk-img" alt="" draggable="false" src="${c.img}"><div class="fk-name"></div>`;
        root.append(el);
        els.set(id, el);
      }
      el.dataset.owner = p.name;
      el.querySelector('.fk-name').textContent = p.name;
      el.classList.toggle('dead', !!p.dead);
      if (fresh) {
        // Spawn: a puff of smoke, then they pop in.
        el.classList.remove('spawn');
        void el.offsetWidth;
        el.classList.add('spawn');
      }
      place(el, c);
    }
  };
})();
