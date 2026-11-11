// A live pixel-art scene behind the chat, drawn in code (no video).
// The scene reacts to the game: day and night, deaths, trials, arrests, clues and your own night action.
// Only things everyone may know are shown to everyone; your own night pick only shows on your screen.
//
// It uses the same coordinates as the old videos, so the characters stand in the same spots:
// Original 864x576 (drawn at 288x192, 3x), The Dark Knight 1280x720 (drawn at 320x180, 4x).
// Switch it off in the main menu (Background) to get the videos back.
(function () {
  const STORE = 'pixelScene';
  let enabled = true;
  try {
    enabled = localStorage.getItem(STORE) !== 'off';
  } catch {}

  let canvas = null;
  let ctx = null;
  let mode = 'classic';
  let phase = 'day';
  let W = 288;
  let H = 192;
  let night = 0; // 0 = day, 1 = night (eased between them)
  let layers = null; // pre-drawn still parts: { day, night }
  let running = false;
  let lastT = 0;
  let time = 0;
  const fx = []; // timed effects
  let particles = []; // fire, smoke, rain …
  let state = { dead: 0, trial: false, guiltyFlash: 0 };

  // ---------- small helpers ----------
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = (c, x, y, w, h, col) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const P = (c, x, y, col) => R(c, x, y, 1, 1, col);
  const lerp = (a, b, t) => a + (b - a) * t;
  function mix(c1, c2, t) {
    const a = parseInt(c1.slice(1), 16);
    const b = parseInt(c2.slice(1), 16);
    const r = Math.round(lerp(a >> 16, b >> 16, t));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
    const bl = Math.round(lerp(a & 255, b & 255, t));
    return `rgb(${r},${g},${bl})`;
  }
  function off(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return [c, x];
  }
  // Sky in flat bands (pixel-art style gradient).
  function sky(c, top, bottom, h, bands = 10) {
    for (let i = 0; i < bands; i++) R(c, 0, (i * h) / bands, W, h / bands + 1, mix(top, bottom, i / (bands - 1)));
  }
  function pine(c, x, base, h, col, shade) {
    const tiers = 3;
    const tierH = h / tiers;
    for (let i = 0; i < h; i++) {
      const tier = Math.floor(i / tierH);
      const inTier = (i % tierH) / tierH;
      const w = Math.max(1, Math.round((h * 0.17 + tier * h * 0.09) * (0.3 + 0.7 * inTier)));
      const y = base - h + i;
      R(c, x - w, y, w, 1, col);
      R(c, x, y, w + 1, 1, shade);
    }
    R(c, x - 1, base, 2, Math.max(2, h * 0.12), '#3b2416');
  }
  function ridge(c, r, y0, amp, step, col, fillTo) {
    let y = y0;
    for (let x = 0; x < W; x++) {
      if (x % step === 0) y = Math.max(y0 - amp, Math.min(y0 + amp * 0.3, y + (r() - 0.5) * amp * 0.6));
      R(c, x, y, 1, fillTo - y, col);
    }
  }

  // ---------- Original: a campfire clearing in the forest ----------
  function drawClassic(isNight) {
    const [c, x] = off(W, H);
    const r = rng(7);
    const N = isNight;
    sky(x, N ? '#0b1030' : '#5fb4ec', N ? '#2b2560' : '#cdeeff', 110);
    // far mountains, hills, tree line
    ridge(x, rng(3), 70, 26, 6, N ? '#1b2048' : '#7f9fc4', 120);
    ridge(x, rng(4), 88, 16, 4, N ? '#162a2a' : '#5f9a66', 125);
    for (let i = 0; i < 46; i++) pine(x, (i * 6.7 + r() * 5) % W, 112 + r() * 8, 20 + r() * 14, N ? '#0e2418' : '#2e6b3c', N ? '#0a1a11' : '#245631');
    // grass
    R(x, 0, 118, W, H - 118, N ? '#1e3a26' : '#6fae4f');
    for (let i = 0; i < 900; i++) P(x, r() * W, 118 + r() * (H - 118), N ? (r() < 0.5 ? '#173020' : '#264a30') : r() < 0.5 ? '#5e9a43' : '#84c25e');
    // dirt clearing around the fire
    for (let yy = -26; yy <= 26; yy++) {
      const w = Math.sqrt(1 - (yy / 26) ** 2) * 92;
      R(x, 144 - w, 162 + yy * 0.62, w * 2, 1, N ? '#3d3127' : '#b98d5c');
    }
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      P(x, 144 + Math.cos(a) * 88 * d, 162 + Math.sin(a) * 15 * d, N ? '#2e251e' : '#a27a4e');
    }
    // stones around the fire
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sx = 144 + Math.cos(a) * 17;
      const sy = 163 + Math.sin(a) * 6;
      R(x, sx - 2, sy - 2, 5, 3, N ? '#3c3f4a' : '#8a8f99');
      R(x, sx - 1, sy - 2, 3, 1, N ? '#555a66' : '#b4b9c2');
    }
    // logs in the fire
    R(x, 135, 162, 18, 2, '#4a2b17');
    R(x, 139, 160, 12, 2, '#5c3720');
    // a stump and a log bench, rocks
    R(x, 40, 150, 12, 9, N ? '#3a2a1c' : '#7a5232');
    R(x, 40, 149, 12, 2, N ? '#5a4632' : '#c9a06a');
    R(x, 214, 172, 30, 5, N ? '#3a2a1c' : '#7a5232');
    R(x, 214, 171, 30, 1, N ? '#4f3a26' : '#9a6c42');
    for (let i = 0; i < 9; i++) {
      const rx = r() * W;
      const ry = 130 + r() * 55;
      if (Math.abs(rx - 144) < 100 && Math.abs(ry - 162) < 18) continue;
      R(x, rx, ry, 4 + r() * 4, 2 + r() * 2, N ? '#2f343d' : '#8b919a');
    }
    // flowers by day
    if (!N) for (let i = 0; i < 40; i++) P(x, r() * W, 125 + r() * 65, ['#f3d24c', '#ffffff', '#f08fb0'][i % 3]);
    return c;
  }

  // ---------- The Dark Knight: Gotham ----------
  function drawGotham(isNight) {
    const [c, x] = off(W, H);
    const r = rng(11);
    const N = isNight;
    sky(x, N ? '#070a18' : '#8f8a86', N ? '#1c2148' : '#e2cfae', 120, 12);
    // far skyline
    const far = rng(21);
    for (let bx = 0; bx < W; ) {
      const w = 6 + far() * 10;
      const h = 40 + far() * 50;
      R(x, bx, 120 - h, w, h + 40, N ? '#11152c' : '#7b7c86');
      if (far() < 0.25) R(x, bx + w / 2 - 1, 120 - h - 8, 2, 8, N ? '#11152c' : '#7b7c86'); // spire
      bx += w;
    }
    // near skyline with windows
    const near = rng(31);
    for (let bx = -4; bx < W; ) {
      const w = 12 + near() * 18;
      const h = 30 + near() * 55;
      const top = 150 - h;
      R(x, bx, top, w, h + 10, N ? '#0c0f1f' : '#56565f');
      R(x, bx, top, w, 1, N ? '#1a1e36' : '#6d6d77');
      for (let wy = top + 3; wy < 146; wy += 4) {
        for (let wx = bx + 2; wx < bx + w - 2; wx += 3) {
          const lit = N ? near() < 0.35 : near() < 0.06;
          P(x, wx, wy, lit ? (N ? '#f6d36b' : '#cfd6dd') : N ? '#151a33' : '#45454d');
        }
      }
      if (near() < 0.3) {
        // smokestack
        R(x, bx + w * 0.6, top - 16, 3, 16, N ? '#151a33' : '#4a4a52');
      }
      bx += w + near() * 3;
    }
    // the rooftop we stand on
    R(x, 0, 150, W, H - 150, N ? '#1b1d2a' : '#5f5a57');
    R(x, 0, 150, W, 2, N ? '#2c2f44' : '#8a827c');
    for (let i = 0; i < 500; i++) P(x, r() * W, 152 + r() * (H - 152), N ? '#151724' : '#544f4c');
    for (let gx = 0; gx < W; gx += 16) R(x, gx, 152, 1, H - 152, N ? '#161825' : '#56514e');
    // water tower
    R(x, 248, 108, 22, 22, N ? '#20202c' : '#6b4d36');
    R(x, 246, 106, 26, 3, N ? '#2a2a38' : '#7d5b40');
    R(x, 250, 130, 2, 20, '#2a2a30');
    R(x, 266, 130, 2, 20, '#2a2a30');
    // gargoyle on the ledge (left)
    const g = N ? '#2a2c38' : '#46464f';
    R(x, 14, 140, 14, 10, g);
    R(x, 22, 132, 8, 9, g);
    R(x, 27, 129, 3, 4, g);
    R(x, 8, 134, 8, 4, g);
    R(x, 4, 131, 6, 3, g);
    // the trash-can fire we all stand around (the "campfire" of Gotham)
    R(x, 153, 156, 14, 14, N ? '#2e3036' : '#55585e');
    R(x, 152, 155, 16, 2, N ? '#40434b' : '#757880');
    R(x, 153, 160, 14, 1, '#24262b');
    R(x, 153, 165, 14, 1, '#24262b');
    // the Ferris wheel of Amusement Mile, far off (night only gets lights; the wheel turns)
    return c;
  }

  // ---------- animated parts ----------
  function fireAt() {
    return mode === 'darkknight' ? [160, 155] : [144, 160];
  }
  function spawnFire(dt) {
    const [fx0, fy0] = fireAt();
    const n = Math.round(dt * (mode === 'darkknight' ? 70 : 110));
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * (mode === 'darkknight' ? 12 : 18);
      particles.push({ k: 'flame', x: fx0 + spread, y: fy0, vx: -spread * 0.6 + (Math.random() - 0.5) * 4, vy: -22 - Math.random() * 22, life: 0, max: 0.45 + Math.random() * 0.55 });
    }
    if (Math.random() < dt * (night ? 4 : 2)) particles.push({ k: 'smoke', x: fx0 + (Math.random() - 0.5) * 4, y: fy0 - 14, vx: 3 + Math.random() * 3, vy: -6 - Math.random() * 4, life: 0, max: 5 + Math.random() * 3 });
    if (Math.random() < dt * 3) particles.push({ k: 'spark', x: fx0 + (Math.random() - 0.5) * 6, y: fy0 - 6, vx: (Math.random() - 0.5) * 14, vy: -26 - Math.random() * 20, life: 0, max: 1 + Math.random() });
  }
  const FLAME = ['#fff3b0', '#ffd34d', '#ff9a2e', '#f2552c', '#b8301e'];
  function drawParticles(dt) {
    const next = [];
    for (const p of particles) {
      p.life += dt;
      if (p.life > p.max) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.life / p.max;
      if (p.k === 'flame') {
        const col = FLAME[Math.min(FLAME.length - 1, Math.floor(t * FLAME.length))];
        const s = t < 0.35 ? 3 : t < 0.7 ? 2 : 1;
        R(ctx, p.x, p.y, s, s, col);
      } else if (p.k === 'smoke') {
        ctx.globalAlpha = (1 - t) * 0.35;
        const s = 2 + t * 6;
        R(ctx, p.x - s / 2, p.y - s / 2, s, s, '#9aa0aa');
        ctx.globalAlpha = 1;
      } else if (p.k === 'spark') {
        if (Math.random() < 0.85) P(ctx, p.x, p.y, '#ffd34d');
      } else if (p.k === 'rain') {
        R(ctx, p.x, p.y, 1, 3, 'rgba(170,190,230,0.55)');
        if (p.y > H) continue;
      } else if (p.k === 'confetti') {
        p.vy += 30 * dt;
        R(ctx, p.x, p.y, 2, 1, p.col);
      } else if (p.k === 'feather') {
        p.vx = Math.sin(p.life * 3) * 8;
        R(ctx, p.x, p.y, 2, 1, '#e8e2cf');
      }
      next.push(p);
    }
    particles = next;
  }
  function disc(cx, cy, r, col) {
    for (let y = -r; y <= r; y++) {
      const w = Math.round(Math.sqrt(r * r - y * y));
      R(ctx, cx - w, cy + y, w * 2 + 1, 1, col);
    }
  }
  function glow(x, y, rad, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col.replace('A', a));
    g.addColorStop(1, col.replace('A', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Fixed stars (seeded) that twinkle.
  const STARS = (() => {
    const r = rng(99);
    return Array.from({ length: 70 }, () => ({ x: r() * 320, y: r() * 85, p: r() * 6 }));
  })();
  const CLOUDS = (() => {
    const r = rng(5);
    return Array.from({ length: 5 }, () => ({ x: r() * 320, y: 8 + r() * 40, w: 18 + r() * 26, s: 2 + r() * 3 }));
  })();
  function drawSky() {
    if (night > 0.05) {
      ctx.globalAlpha = night;
      for (const s of STARS) if (Math.sin(time * 2 + s.p * 5) > -0.6) P(ctx, s.x, s.y, '#fff7d6');
      ctx.globalAlpha = 1;
    }
    // sun and moon move across as the day turns
    const sunY = lerp(22, 140, night);
    if (night < 0.95) {
      glow(W * 0.8, sunY, 26, 'rgba(255,230,140,A)', 0.5 * (1 - night));
      disc(Math.round(W * 0.8), Math.round(sunY), 8, '#ffe066');
      disc(Math.round(W * 0.8) - 2, Math.round(sunY) - 2, 4, '#fff3b0');
    }
    const moonY = lerp(140, 24, night);
    if (night > 0.05) {
      glow(W * 0.2, moonY, 22, 'rgba(220,230,255,A)', 0.35 * night);
      disc(Math.round(W * 0.2), Math.round(moonY), 8, '#f2efd8');
      disc(Math.round(W * 0.2) + 4, Math.round(moonY) - 3, 7, mode === 'darkknight' ? '#0a0e20' : '#10153a'); // crescent bite
      P(ctx, Math.round(W * 0.2) - 4, Math.round(moonY) + 2, '#d6d2b8');
      P(ctx, Math.round(W * 0.2) - 2, Math.round(moonY) + 5, '#d6d2b8');
    }
    // clouds drift by day
    if (night < 0.9) {
      ctx.globalAlpha = 1 - night;
      for (const cl of CLOUDS) {
        const cx = ((cl.x + time * cl.s) % (W + 60)) - 40;
        R(ctx, cx, cl.y, cl.w, 4, '#ffffff');
        R(ctx, cx + cl.w * 0.2, cl.y - 3, cl.w * 0.5, 3, '#ffffff');
        R(ctx, cx + 2, cl.y + 4, cl.w - 4, 2, '#dbe8f3');
      }
      ctx.globalAlpha = 1;
    }
  }
  // The Ferris wheel of Amusement Mile (The Dark Knight).
  function drawWheel() {
    const cx = 205;
    const cy = 92;
    const rad = 30;
    const col = night > 0.5 ? '#2a2540' : '#4d4a52';
    for (let a = 0; a < Math.PI * 2; a += 0.05) P(ctx, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, col);
    const rot = time * 0.25;
    for (let i = 0; i < 8; i++) {
      const a = rot + (i / 8) * Math.PI * 2;
      for (let d = 0; d < rad; d += 1.5) P(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, col);
      const lx = cx + Math.cos(a) * rad;
      const ly = cy + Math.sin(a) * rad;
      R(ctx, lx - 2, ly, 4, 3, col);
      if (night > 0.3) {
        ctx.globalAlpha = night;
        P(ctx, lx, ly - 1, i % 2 ? '#a3e635' : '#c084fc');
        ctx.globalAlpha = 1;
      }
    }
    R(ctx, cx - 1, cy, 2, 60, col);
    R(ctx, cx - 14, cy + 58, 28, 2, col);
    // the neon sign at the gate
    if (night > 0.3) {
      const flick = Math.sin(time * 13) > -0.85 ? 1 : 0.2;
      ctx.globalAlpha = night * flick;
      // "HA HA" neon on top of a building, far left
      const sx = 20;
      const sy = 60;
      R(ctx, sx, sy, 34, 1, '#a3e635');
      R(ctx, sx, sy + 9, 34, 1, '#a3e635');
      R(ctx, sx, sy, 1, 10, '#c084fc');
      R(ctx, sx + 33, sy, 1, 10, '#c084fc');
      for (let i = 0; i < 6; i++) R(ctx, sx + 4 + i * 5, sy + 3, 3, 3, i % 2 ? '#c084fc' : '#a3e635');
      ctx.globalAlpha = 1;
    }
  }
  // The bat signal in the clouds (The Dark Knight, night).
  function drawBatSignal() {
    if (night < 0.3) return;
    ctx.globalAlpha = night * 0.85;
    glow(70, 30, 20, 'rgba(255,240,170,A)', 0.55);
    ctx.globalAlpha = night;
    const bx = 70;
    const by = 30;
    R(ctx, bx - 8, by - 1, 16, 3, '#111');
    R(ctx, bx - 4, by - 3, 8, 6, '#111');
    R(ctx, bx - 1, by - 5, 1, 2, '#111');
    R(ctx, bx + 1, by - 5, 1, 2, '#111');
    R(ctx, bx - 10, by + 1, 3, 2, '#111');
    R(ctx, bx + 7, by + 1, 3, 2, '#111');
    ctx.globalAlpha = 1;
  }
  // Fireflies (night) and birds (day) in the forest.
  const FLIES = Array.from({ length: 14 }, (_, i) => ({ x: (i * 37) % 288, y: 120 + ((i * 53) % 60), p: i }));
  function drawLife() {
    if (mode === 'classic' && night > 0.4) {
      ctx.globalAlpha = night;
      for (const f of FLIES) {
        if (Math.sin(time * 2.2 + f.p) < 0.2) continue;
        P(ctx, f.x + Math.sin(time * 0.7 + f.p) * 8, f.y + Math.cos(time * 0.9 + f.p) * 4, '#d9f99d');
      }
      ctx.globalAlpha = 1;
    }
    if (night < 0.6) {
      // a little flock crossing now and then
      const t = (time % 26) / 26;
      if (t < 0.5) {
        const bx = lerp(-20, W + 20, t * 2);
        for (let i = 0; i < 4; i++) {
          const x = bx - i * 7;
          const y = 30 + i * 3 + Math.sin(time * 4 + i) * 2;
          const up = Math.sin(time * 10 + i) > 0;
          P(ctx, x - 1, y - (up ? 1 : 0), '#2a2a2a');
          P(ctx, x, y, '#2a2a2a');
          P(ctx, x + 1, y - (up ? 1 : 0), '#2a2a2a');
        }
      }
    }
  }
  // Graves for every player who has died (Original).
  function drawGraves() {
    if (mode !== 'classic') return;
    const n = Math.min(state.dead, 10);
    for (let i = 0; i < n; i++) {
      const gx = 8 + (i % 5) * 9;
      const gy = 170 + Math.floor(i / 5) * 10;
      R(ctx, gx, gy - 7, 6, 8, night > 0.5 ? '#5d6270' : '#9aa0aa');
      R(ctx, gx + 1, gy - 8, 4, 1, night > 0.5 ? '#5d6270' : '#9aa0aa');
      R(ctx, gx + 2, gy - 5, 2, 1, '#3a3d46');
      R(ctx, gx + 1, gy, 4, 1, '#3b5f2f');
    }
  }

  // ---------- effects ----------
  function addFx(kind, data = {}) {
    fx.push({ kind, t: 0, ...data });
  }
  function drawFx(dt) {
    let shake = 0;
    let flash = 0;
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      e.t += dt;
      const p = e.t / e.dur;
      if (p >= 1) {
        fx.splice(i, 1);
        continue;
      }
      if (e.kind === 'lightning') {
        flash = Math.max(flash, p < 0.08 || (p > 0.15 && p < 0.22) ? 0.75 : 0);
        shake = Math.max(shake, p < 0.3 ? 2 : 0);
        if (p < 0.25) {
          // a bolt from the sky
          let lx = e.x;
          for (let y = 0; y < 110; y += 4) {
            const nx = lx + (Math.random() - 0.5) * 8;
            R(ctx, Math.min(lx, nx), y, Math.abs(nx - lx) + 1, 4, '#f5f7ff');
            lx = nx;
          }
        }
      } else if (e.kind === 'crows') {
        for (let k = 0; k < 7; k++) {
          const x = lerp(-30 - k * 12, W + 40, p) + Math.sin(e.t * 3 + k) * 4;
          const y = 40 + k * 4 + Math.sin(e.t * 5 + k * 2) * 3;
          const up = Math.sin(e.t * 14 + k) > 0;
          R(ctx, x - 2, y - (up ? 2 : 0), 2, 1, '#111');
          R(ctx, x, y, 2, 2, '#111');
          R(ctx, x + 2, y - (up ? 2 : 0), 2, 1, '#111');
        }
      } else if (e.kind === 'note') {
        // a paper note flutters down to the fire
        const [fx0, fy0] = fireAt();
        const x = fx0 + 40 + Math.sin(e.t * 3) * 14 * (1 - p);
        const y = lerp(-10, fy0 + 6, Math.min(1, p * 1.4));
        R(ctx, x, y, 7, 5, '#f4ecd2');
        R(ctx, x + 1, y + 1, 5, 1, '#9b8b6a');
        R(ctx, x + 1, y + 3, 4, 1, '#9b8b6a');
        if (p > 0.7) glow(x + 3, y + 2, 8, 'rgba(255,240,180,A)', 0.4 * (1 - p) * 3);
      } else if (e.kind === 'police') {
        const on = Math.floor(e.t * 6) % 2;
        ctx.globalAlpha = 0.28 * (1 - p);
        R(ctx, 0, 0, W / 2, H, on ? '#ff2a2a' : '#2a5cff');
        R(ctx, W / 2, 0, W / 2, H, on ? '#2a5cff' : '#ff2a2a');
        ctx.globalAlpha = 1;
      } else if (e.kind === 'confetti' && e.t < dt * 1.5) {
        for (let k = 0; k < 60; k++) particles.push({ k: 'confetti', x: Math.random() * W, y: -Math.random() * 30, vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 20, life: 0, max: 4, col: ['#facc15', '#22c55e', '#38bdf8', '#f472b6', '#ffffff'][k % 5] });
      } else if (e.kind === 'paws') {
        // only on the wolf's own screen: paw prints creeping across the ground
        const n = Math.floor(p * 14);
        for (let k = 0; k < n; k++) {
          const x = 20 + k * ((W - 40) / 14);
          const y = 178 - (k % 2) * 5;
          ctx.globalAlpha = Math.min(1, (1 - p) * 3) * 0.8;
          R(ctx, x, y, 3, 2, '#7f1d1d');
          P(ctx, x - 1, y - 2, '#7f1d1d');
          P(ctx, x + 1, y - 3, '#7f1d1d');
          P(ctx, x + 3, y - 2, '#7f1d1d');
          ctx.globalAlpha = 1;
        }
        // red eyes in the dark
        if (Math.sin(e.t * 8) > -0.7) {
          P(ctx, 60, 112, '#ff3030');
          P(ctx, 63, 112, '#ff3030');
          P(ctx, 230, 108, '#ff3030');
          P(ctx, 233, 108, '#ff3030');
        }
      } else if (e.kind === 'shield') {
        const [fx0, fy0] = fireAt();
        const rad = 10 + p * 50;
        ctx.globalAlpha = (1 - p) * 0.9;
        for (let a = 0; a < Math.PI * 2; a += 0.08) P(ctx, fx0 + Math.cos(a) * rad, fy0 - 10 + Math.sin(a) * rad * 0.5, '#5eead4');
        R(ctx, fx0 - 1, fy0 - 26, 3, 9, '#5eead4');
        R(ctx, fx0 - 4, fy0 - 23, 9, 3, '#5eead4');
        ctx.globalAlpha = 1;
      } else if (e.kind === 'magnify') {
        const x = lerp(30, W - 30, p);
        const y = 150 + Math.sin(p * Math.PI * 3) * 10;
        ctx.globalAlpha = 0.25 * Math.sin(p * Math.PI);
        glow(x, y, 26, 'rgba(255,255,220,A)', 1);
        ctx.globalAlpha = Math.sin(p * Math.PI);
        for (let a = 0; a < Math.PI * 2; a += 0.15) P(ctx, x + Math.cos(a) * 7, y + Math.sin(a) * 7, '#e5e7eb');
        R(ctx, x + 5, y + 5, 2, 2, '#9ca3af');
        R(ctx, x + 7, y + 7, 2, 2, '#9ca3af');
        ctx.globalAlpha = 1;
      } else if (e.kind === 'poison') {
        ctx.globalAlpha = 0.35 * Math.sin(p * Math.PI);
        for (let k = 0; k < 40; k++) {
          const x = (k * 29 + e.t * 12 * (k % 3 + 1)) % W;
          const y = 140 + Math.sin(e.t * 2 + k) * 20 + (k % 5) * 6;
          R(ctx, x, y, 4, 3, k % 2 ? '#22c55e' : '#86efac');
        }
        ctx.globalAlpha = 1;
      } else if (e.kind === 'crosshair') {
        const x = W / 2 + Math.sin(e.t * 1.7) * 60;
        const y = 150 + Math.cos(e.t * 2.3) * 12;
        ctx.globalAlpha = Math.sin(p * Math.PI);
        for (let a = 0; a < Math.PI * 2; a += 0.12) P(ctx, x + Math.cos(a) * 9, y + Math.sin(a) * 9, '#ef4444');
        R(ctx, x - 13, y, 26, 1, '#ef4444');
        R(ctx, x, y - 13, 1, 26, '#ef4444');
        ctx.globalAlpha = 1;
      } else if (e.kind === 'flash') {
        flash = Math.max(flash, (1 - p) * (e.a || 0.5));
      }
    }
    return { shake, flash };
  }

  // ---------- the loop ----------
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    // ~30 frames a second is plenty for pixel art
    if (now - lastT < 30) return;
    lastT = now;
    time += dt;
    const target = phase === 'night' ? 1 : 0;
    night += (target - night) * Math.min(1, dt * 1.5);
    if (Math.abs(target - night) < 0.002) night = target;

    const shakeInfo = { shake: 0 };
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    // still layers, cross-faded between day and night
    // sky first, then sun/moon/stars/clouds, then the land in front of them
    ctx.drawImage(layers.day, 0, 0, W, layers.skyH, 0, 0, W, layers.skyH);
    if (night > 0) {
      ctx.globalAlpha = night;
      ctx.drawImage(layers.night, 0, 0, W, layers.skyH, 0, 0, W, layers.skyH);
      ctx.globalAlpha = 1;
    }
    drawSky();
    ctx.drawImage(layers.dayLand, 0, 0);
    if (night > 0) {
      ctx.globalAlpha = night;
      ctx.drawImage(layers.nightLand, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (mode === 'darkknight') {
      drawBatSignal();
      drawWheel();
    }
    drawLife();
    drawGraves();
    // the fire and its light
    spawnFire(dt);
    const [fx0, fy0] = fireAt();
    glow(fx0, fy0 - 6, 40 + night * 50 + Math.sin(time * 9) * 3, 'rgba(255,150,60,A)', 0.18 + night * 0.35);
    // rain over Gotham
    if (mode === 'darkknight') {
      const n = Math.round(dt * (night > 0.5 ? 260 : 80));
      for (let i = 0; i < n; i++) particles.push({ k: 'rain', x: Math.random() * (W + 40), y: -4, vx: -30, vy: 180 + Math.random() * 60, life: 0, max: 2 });
    }
    drawParticles(dt);
    // a trial: a spotlight from above onto the middle
    if (state.trial) {
      ctx.globalAlpha = 0.18 + Math.sin(time * 2) * 0.04;
      ctx.fillStyle = '#fff7d6';
      ctx.beginPath();
      ctx.moveTo(fx0 - 6, 0);
      ctx.lineTo(fx0 + 6, 0);
      ctx.lineTo(fx0 + 40, H);
      ctx.lineTo(fx0 - 40, H);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const { shake, flash } = drawFx(dt);
    ctx.restore();
    if (shake) canvas.style.transform = `translate(${(Math.random() - 0.5) * shake * 2}px, ${(Math.random() - 0.5) * shake * 2}px)`;
    else if (canvas.style.transform) canvas.style.transform = '';
    if (flash) {
      ctx.globalAlpha = flash;
      R(ctx, 0, 0, W, H, '#ffffff');
      ctx.globalAlpha = 1;
    }
    void shakeInfo;
  }
  function start() {
    if (running) return;
    running = true;
    lastT = 0;
    requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
  }
  document.addEventListener('visibilitychange', () => {
    if (!canvas || canvas.classList.contains('hidden')) return;
    if (document.hidden) stop();
    else start();
  });

  // Copy of a layer with the sky bands made see-through.
  function landOf(src, [top, bottom], skyH) {
    const [c, x] = off(W, H);
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, W, H);
    const bands = mode === 'darkknight' ? 12 : 10;
    const sky = new Set();
    for (let i = 0; i < bands; i++) {
      const m = mix(top, bottom, i / (bands - 1)).match(/\d+/g).map(Number);
      sky.add(m.join(','));
    }
    for (let y = 0; y < skyH; y++) {
      for (let xx = 0; xx < W; xx++) {
        const o = (y * W + xx) * 4;
        if (sky.has(img.data[o] + ',' + img.data[o + 1] + ',' + img.data[o + 2])) img.data[o + 3] = 0;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function build(newMode) {
    mode = newMode;
    [W, H] = mode === 'darkknight' ? [320, 180] : [288, 192];
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    const draw = mode === 'darkknight' ? drawGotham : drawClassic;
    layers = { day: draw(false), night: draw(true), skyH: mode === 'darkknight' ? 120 : 110 };
    // The land: everything that isn't plain sky (so the sun, moon and stars sit behind hills and buildings).
    layers.dayLand = landOf(layers.day, mode === 'darkknight' ? ['#8f8a86', '#e2cfae'] : ['#5fb4ec', '#cdeeff'], layers.skyH);
    layers.nightLand = landOf(layers.night, mode === 'darkknight' ? ['#070a18', '#1c2148'] : ['#0b1030', '#2b2560'], layers.skyH);
    particles = [];
  }

  window.PixelScene = {
    enabled: () => enabled,
    get active() {
      return enabled && !!canvas && !canvas.classList.contains('hidden');
    },
    setEnabled(on) {
      enabled = !!on;
      try {
        localStorage.setItem(STORE, on ? 'on' : 'off');
      } catch {}
    },
    show(root, newMode, newPhase) {
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'scene-video pixel-scene on';
        canvas.setAttribute('aria-hidden', 'true');
        ctx = canvas.getContext('2d');
        root.prepend(canvas);
      }
      canvas.classList.remove('hidden');
      canvas.classList.add('on');
      if (newMode !== mode || !layers) build(newMode);
      if (!layers) build(newMode);
      phase = newPhase;
      start();
    },
    hide() {
      if (!canvas) return;
      canvas.classList.add('hidden');
      canvas.classList.remove('on');
      stop();
    },
    // What everyone may see, from the shared game state.
    update(s) {
      if (!s) return;
      state.dead = (s.dead || []).length;
      state.trial = !!s.trial?.open;
    },
    // Game events. Private ones (your own night pick) are only sent by your own screen.
    event(kind, data) {
      if (!canvas || canvas.classList.contains('hidden')) return;
      const [fx0] = fireAt();
      if (kind === 'death') {
        addFx('lightning', { dur: 1.4, x: fx0 + (Math.random() - 0.5) * 120 });
        addFx('crows', { dur: 5 });
      } else if (kind === 'guilty') {
        addFx('lightning', { dur: 1.4, x: fx0 });
        addFx('crows', { dur: 5 });
      } else if (kind === 'innocent') addFx('confetti', { dur: 3 });
      else if (kind === 'arrest') addFx('police', { dur: 5 });
      else if (kind === 'clue') addFx('note', { dur: 3 });
      else if (kind === 'start') {
        addFx('flash', { dur: 0.8, a: 0.4 });
        addFx('confetti', { dur: 3 });
      } else if (kind === 'my-kill' || kind === 'my-vigil') addFx(kind === 'my-kill' ? 'paws' : 'crosshair', { dur: 4 });
      else if (kind === 'my-heal') addFx('shield', { dur: 2 });
      else if (kind === 'my-investigate' || kind === 'my-interrogate') addFx('magnify', { dur: 3 });
      else if (kind === 'my-poison') addFx('poison', { dur: 4 });
      void data;
    },
  };
})();
