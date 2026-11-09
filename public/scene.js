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

// ---------- Firekeeper: a character standing by the fire ----------
// He belongs to the first player who joined. Positions are in the videos' own pixels (864x576),
// mapped onto the screen the same way the video is cropped (object-fit: cover).
(function () {
  const VIDEO_W = 864;
  const VIDEO_H = 576;
  // Where his feet go (left of the fire ring), how tall he is, and how the video is anchored.
  const SPOT = {
    day: { x: 250, y: 452, h: 138, posX: 0.5 },
    night: { x: 236, y: 478, h: 138, posX: 0.55 },
  };
  let el = null;
  let current = { name: null, dead: false, phase: 'day' };

  function build(root) {
    el = document.createElement('div');
    el.className = 'firekeeper hidden';
    el.innerHTML = '<div class="fk-poof"></div><img class="fk-img" alt="" draggable="false" src="img/characters/firekeeper.webp"><div class="fk-name"></div>';
    root.append(el);
    window.addEventListener('resize', place);
    new ResizeObserver(place).observe(root);
  }

  function place() {
    if (!el || !current.name) return;
    const root = el.parentElement;
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    const s = SPOT[current.phase] || SPOT.day;
    const scale = Math.max(cw / VIDEO_W, ch / VIDEO_H);
    const offX = (cw - VIDEO_W * scale) * s.posX;
    const offY = ch - VIDEO_H * scale; // anchored at the bottom
    const h = Math.max(80, Math.min(260, s.h * scale));
    // On narrow screens the video's sides are cropped off; keep him (and his name) fully in view.
    const half = h * 0.3 + 12;
    const x = Math.min(Math.max(offX + s.x * scale, half), cw - half);
    el.style.left = x + 'px';
    el.style.top = offY + s.y * scale + 'px';
    el.style.setProperty('--fk-h', h + 'px');
  }

  window.setFirekeeper = function (name, dead, phase) {
    const root = document.getElementById('scene');
    if (!root) return;
    if (!el) build(root);
    const changed = name !== current.name;
    current = { name, dead: !!dead, phase: phase === 'night' ? 'night' : 'day' };
    el.classList.toggle('hidden', !name);
    el.classList.toggle('dead', !!dead);
    el.querySelector('.fk-name').textContent = name || '';
    if (name && changed) {
      // Spawn: a puff of smoke, then he pops in.
      el.classList.remove('spawn');
      void el.offsetWidth;
      el.classList.add('spawn');
    }
    place();
  };
})();
