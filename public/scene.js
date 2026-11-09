// Background videos behind the chat: a campfire by day, a haunted house by night.
// Both load once; switching phase cross-fades them, and the hidden one is paused.
(function () {
  // Bump this when a video file changes so browsers fetch the new one.
  const VERSION = 4;
  let videos = null;
  function build(root) {
    videos = {};
    for (const phase of ['day', 'night']) {
      const v = document.createElement('video');
      v.className = `scene-video ${phase}`;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.poster = `video/${phase}-poster.jpg?v=${VERSION}`;
      for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
        const src = document.createElement('source');
        src.src = `video/${phase}.${ext}?v=${VERSION}`;
        src.type = type;
        v.append(src);
      }
      root.append(v);
      videos[phase] = v;
    }
  }
  window.setScene = function (phase) {
    const root = document.getElementById('scene');
    if (!root) return;
    if (!videos) build(root);
    const active = phase === 'night' ? 'night' : 'day';
    for (const [name, v] of Object.entries(videos)) {
      const on = name === active;
      v.classList.toggle('on', on);
      if (on) v.play().catch(() => {});
      else setTimeout(() => !v.classList.contains('on') && v.pause(), 1000); // pause after the fade
    }
  };
  // Browsers pause background videos in hidden tabs; resume when the tab comes back.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && videos) for (const v of Object.values(videos)) if (v.classList.contains('on')) v.play().catch(() => {});
  });
})();

// ---------- Characters standing by the fire ----------
// Players who picked a character on the character select screen stand around the fire.
// Spots are in the videos' own pixels (864x576), mapped onto the screen the same way
// the video is cropped (object-fit: cover, anchored at the bottom).
(function () {
  const VIDEO_W = 864;
  const VIDEO_H = 576;
  const POS_X = { day: 0.5, night: 0.55 }; // matches the videos' object-position
  const els = new Map(); // character id -> element
  let phase = 'day';
  let root = null;

  function place(el, c) {
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    const spot = c.spot[phase] || c.spot.day;
    const scale = Math.max(cw / VIDEO_W, ch / VIDEO_H);
    const offX = (cw - VIDEO_W * scale) * POS_X[phase];
    const offY = ch - VIDEO_H * scale;
    let h = Math.max(80, Math.min(260, (c.height || 138) * scale));
    // On narrow screens the video's sides are cropped off, so there is no room beside the fire.
    // Then they stand in front of it instead: lower down, a bit smaller, kept off the message box.
    const wantX = offX + spot.x * scale;
    let y = offY + spot.y * scale;
    // Keep them inside the chat area (the side panels float over the scene on bigger screens).
    const chat = document.querySelector('.chat');
    const sr = root.getBoundingClientRect();
    const cr = chat ? chat.getBoundingClientRect() : sr;
    const minX = cr.left - sr.left;
    const maxX = cr.right - sr.left;
    const half = h * 0.3 + 12;
    let x = Math.min(Math.max(wantX, minX + half), maxX - half);
    if (Math.abs(x - wantX) > h * 0.15) {
      h = Math.min(h, Math.max(80, (maxX - minX) * 0.26));
      const halfSmall = h * 0.3 + 8;
      x = c.spot.day.x < VIDEO_W / 2 ? minX + halfSmall : maxX - halfSmall;
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

  // list: [{ name, character, dead }]
  window.setFireCharacters = function (list, newPhase) {
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
