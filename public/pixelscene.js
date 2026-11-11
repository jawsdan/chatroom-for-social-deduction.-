// A live pixel-art scene behind the chat, drawn in code (no video).
// A village square seen from above: a round plaza with the fire in the middle, houses around it,
// and every player standing in a ring. The Dark Knight turns it into a rainy Gotham square.
// It reacts to the game: day and night, deaths, trials, arrests, clues and your own night action.
// Only things everyone may know are shown to everyone; your own night pick only shows on your screen.
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
  let W = 320;
  let H = 200;
  let scale = 4; // screen pixels per scene pixel
  let night = 0;
  let layers = null;
  let running = false;
  let lastT = 0;
  let time = 0;
  const fx = [];
  let particles = [];
  const state = { dead: 0, trial: false };
  // The plaza in scene pixels (set from the chat area so the ring sits where the chat is).
  let plaza = { cx: 160, cy: 110, rx: 60, ry: 30 };
  let lights = []; // lanterns and windows that glow at night

  // ---------- helpers ----------
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
    c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };
  const P = (c, x, y, col) => R(c, x, y, 1, 1, col);
  const lerp = (a, b, t) => a + (b - a) * t;
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }
  function off(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return [c, x];
  }
  function ellipse(c, cx, cy, rx, ry, col) {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)));
      R(c, cx - w, cy + y, w * 2 + 1, 1, col);
    }
  }
  function disc(c, cx, cy, r, col) {
    ellipse(c, cx, cy, r, r, col);
  }

  // ---------- pieces of the village ----------
  const ROOFS = ['#b5532f', '#9c3f2a', '#5d7fa3', '#7a6a9a', '#3f7f5a', '#a77b3c', '#8c4b6b'];
  function house(c, r, x, y, w, N, dk) {
    // 3/4 view: a roof on top, the front wall below with a door and windows.
    const roofH = Math.round(w * 0.55);
    const wallH = Math.round(w * 0.42);
    if (dk) {
      // Gotham: dark brick block with a flat roof and lots of windows
      const base = N ? ['#4a3a3a', '#3c3f4a', '#4b4036', '#353a45'][Math.floor(r() * 4)] : ['#8a5a4a', '#6a6f80', '#8b7356', '#5d6a80'][Math.floor(r() * 4)];
      R(c, x, y, w, roofH, shade(base, N ? 0.55 : 1.1));
      R(c, x, y, w, 1, shade(base, N ? 0.7 : 1.35));
      R(c, x + 2, y + 2, 3, 3, N ? '#2a2c34' : '#5b5e66'); // roof vent
      R(c, x, y + roofH, w, wallH + 4, shade(base, N ? 0.4 : 0.8));
      for (let wy = y + roofH + 2; wy < y + roofH + wallH + 1; wy += 3) {
        for (let wx = x + 2; wx < x + w - 2; wx += 3) {
          const lit = r() < (N ? 0.5 : 0.08);
          P(c, wx, wy, lit ? '#f6d36b' : N ? '#14161e' : '#2f323b');
          if (lit && N) lights.push({ x: wx, y: wy, r: 4, col: 'rgba(255,210,110,A)', a: 0.25 });
        }
      }
      R(c, x + w / 2 - 1, y + roofH + wallH, 3, 4, '#1a1a20');
      return;
    }
    const roof = ROOFS[Math.floor(r() * ROOFS.length)];
    const wall = ['#e8dcc0', '#d9c8a0', '#cfc3ad', '#e3d3b4'][Math.floor(r() * 4)];
    // shadow
    R(c, x + 2, y + roofH + wallH, w, 2, 'rgba(0,0,0,0.25)');
    // wall
    R(c, x, y + roofH - 1, w, wallH + 1, N ? shade(wall, 0.45) : wall);
    R(c, x, y + roofH - 1, 1, wallH + 1, N ? shade(wall, 0.35) : shade(wall, 0.85));
    // timber beams
    if (r() < 0.6) {
      R(c, x + w / 3, y + roofH, 1, wallH, N ? '#2b1d14' : '#5a3a22');
      R(c, x + (2 * w) / 3, y + roofH, 1, wallH, N ? '#2b1d14' : '#5a3a22');
    }
    // door and windows
    R(c, x + w / 2 - 1, y + roofH + wallH - 4, 3, 4, N ? '#2a1a10' : '#6b4226');
    for (const wx of [x + 2, x + w - 5]) {
      const lit = N && r() < 0.75;
      R(c, wx, y + roofH + 1, 3, 2, lit ? '#ffd66b' : N ? '#1d2233' : '#7fb6d6');
      if (lit) lights.push({ x: wx + 1, y: y + roofH + 2, r: 6, col: 'rgba(255,200,100,A)', a: 0.3 });
    }
    // roof: two slopes with a ridge
    for (let i = 0; i < roofH; i++) {
      const inset = Math.round((i / roofH) * 0) ;
      const col = i < roofH / 2 ? shade(roof, N ? 0.5 : 1.12) : shade(roof, N ? 0.4 : 0.9);
      R(c, x - 1 + inset, y + i, w + 2 - inset * 2, 1, col);
    }
    R(c, x - 1, y + Math.floor(roofH / 2), w + 2, 1, shade(roof, N ? 0.3 : 0.7)); // ridge
    // tile rows
    for (let i = 2; i < roofH; i += 3) for (let tx = x + (i % 2); tx < x + w; tx += 3) P(c, tx, y + i, shade(roof, N ? 0.35 : 0.8));
    // chimney
    if (r() < 0.7) {
      const cx = x + 2 + Math.floor(r() * (w - 6));
      R(c, cx, y - 3, 3, 5, N ? '#3d3b40' : '#8a7f78');
      R(c, cx, y - 3, 3, 1, N ? '#2a282c' : '#5f5752');
    }
  }
  function tree(c, x, y, s, N) {
    R(c, x + s * 0.2, y + s * 0.7, s * 1.1, s * 0.35, 'rgba(0,0,0,0.25)'); // shadow
    R(c, x - 1, y + s * 0.4, 2, s * 0.5, N ? '#2a1a10' : '#5a3a22');
    disc(c, x, y, s * 0.55, N ? '#0f2a1a' : '#2f7a3a');
    disc(c, x - s * 0.15, y - s * 0.15, s * 0.38, N ? '#163a24' : '#3f9a4a');
    disc(c, x - s * 0.22, y - s * 0.25, s * 0.16, N ? '#1d4a2e' : '#62b85a');
  }
  function lamp(c, x, y, N, dk) {
    R(c, x, y - 9, 1, 10, dk ? '#22252e' : '#3b3326');
    R(c, x - 1, y - 11, 3, 2, N ? '#ffe08a' : dk ? '#4a4f5c' : '#6b5a3a');
    lights.push({ x, y: y - 10, r: 14, col: dk ? 'rgba(255,220,140,A)' : 'rgba(255,190,90,A)', a: 0.45 });
  }

  // ---------- the whole square ----------
  function drawSquare(N) {
    const [c, x] = off(W, H);
    const dk = mode === 'darkknight';
    const r = rng(dk ? 44 : 17);
    if (N) lights = [];
    const { cx, cy, rx, ry } = plaza;
    // ground
    if (dk) {
      R(x, 0, 0, W, H, N ? '#1a1c24' : '#767782');
      for (let i = 0; i < W * H * 0.05; i++) P(x, r() * W, r() * H, N ? '#20232d' : '#83848f');
      // puddles
      for (let i = 0; i < 14; i++) ellipse(x, r() * W, r() * H, 3 + r() * 6, 1 + r() * 2, N ? '#262c3e' : '#6a7383');
    } else {
      R(x, 0, 0, W, H, N ? '#18301f' : '#62a94a');
      for (let i = 0; i < W * H * 0.08; i++) P(x, r() * W, r() * H, N ? (r() < 0.5 ? '#13281a' : '#1f3b27') : r() < 0.5 ? '#579a40' : '#76bd58');
      for (let i = 0; i < 70; i++) P(x, r() * W, r() * H, N ? '#2a4a34' : ['#f3d24c', '#ffffff', '#f08fb0'][i % 3]);
    }
    // paths from the plaza outward (like spokes)
    const pathCol = dk ? (N ? '#2a2c35' : '#6a6b73') : N ? '#3b3a35' : '#b89f7a';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      for (let d = 0; d < Math.max(W, H); d += 1) {
        const px = cx + Math.cos(a) * (rx + d);
        const py = cy + Math.sin(a) * (ry + d * (ry / rx));
        if (px < -4 || py < -4 || px > W + 4 || py > H + 4) break;
        R(x, px - 2, py - 1, 5, 3, pathCol);
      }
    }
    // the plaza: cobblestones
    const base = dk ? (N ? '#2c2f3a' : '#787a84') : N ? '#3d3a44' : '#a3988c';
    ellipse(x, cx, cy + 2, rx + 3, ry + 2, 'rgba(0,0,0,0.25)');
    ellipse(x, cx, cy, rx + 3, ry + 2, dk ? (N ? '#22242c' : '#5e6068') : N ? '#2e2b33' : '#7d7368');
    ellipse(x, cx, cy, rx, ry, base);
    for (let yy = -ry; yy <= ry; yy += 2) {
      const w = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2));
      for (let xx = -w + ((yy / 2) % 2 ? 2 : 0); xx < w - 1; xx += 4) {
        const v = r();
        R(x, cx + xx, cy + yy, 3, 1, v < 0.5 ? shade(base, 0.85) : shade(base, 1.12));
      }
    }
    // inner ring around the fire
    ellipse(x, cx, cy, rx * 0.32, ry * 0.32, shade(base, 0.8));
    ellipse(x, cx, cy, rx * 0.27, ry * 0.27, dk ? (N ? '#1c1d24' : '#55565e') : N ? '#2a2620' : '#6b5a46');
    if (dk) {
      // the trash-can fire
      R(x, cx - 4, cy - 7, 9, 8, N ? '#30333a' : '#585b62');
      R(x, cx - 5, cy - 8, 11, 2, N ? '#454953' : '#787b83');
    } else {
      // fire pit stones and logs
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        R(x, cx + Math.cos(a) * 12 - 1, cy + Math.sin(a) * 6 - 1, 4, 3, N ? '#4a4e58' : '#8a8f99');
      }
      R(x, cx - 6, cy, 12, 2, '#4a2b17');
      R(x, cx - 4, cy - 2, 8, 2, '#5c3720');
    }
    // houses and trees all around the plaza (not on the paths, not on the plaza)
    const spots = [];
    const tries = 260;
    for (let i = 0; i < tries; i++) {
      const a = r() * Math.PI * 2;
      const dist = 1.35 + r() * 1.6;
      const hx = cx + Math.cos(a) * rx * dist;
      const hy = cy + Math.sin(a) * ry * dist * 1.25;
      spots.push({ x: hx, y: hy, a });
    }
    // also scatter some to reach the screen corners
    for (let i = 0; i < 80; i++) spots.push({ x: r() * W, y: r() * H, a: 0 });
    const placed = [];
    const onPath = (px, py) => {
      const ang = Math.atan2((py - cy) / ry, (px - cx) / rx);
      for (let k = 0; k < 8; k++) {
        let d = Math.abs(ang - ((k / 8) * Math.PI * 2 + Math.PI / 8));
        d = Math.min(d, Math.PI * 2 - d);
        if (d < 0.16) return true;
      }
      return false;
    };
    const items = [];
    for (const s of spots) {
      const isHouse = r() < (dk ? 0.75 : 0.5);
      const w = isHouse ? 14 + Math.floor(r() * 10) : 6 + r() * 5;
      const h = isHouse ? w * 1.0 : w;
      const bx = s.x - w / 2;
      const by = s.y - h / 2;
      if (bx < -w || by < -h || bx > W || by > H) continue;
      // keep off the plaza and its rim (players stand there)
      const ex = (s.x - cx) / (rx * 1.45);
      const ey = (s.y + h * 0.3 - cy) / (ry * 1.9);
      if (ex * ex + ey * ey < 1) continue;
      if (onPath(s.x, s.y)) continue;
      if (placed.some((p) => Math.abs(p.x - s.x) < (p.w + w) / 2 + 2 && Math.abs(p.y - s.y) < (p.h + h) / 2 + 2)) continue;
      placed.push({ x: s.x, y: s.y, w, h });
      items.push({ isHouse, bx, by, w, s });
    }
    items.sort((a, b) => a.by - b.by);
    for (const it of items) {
      if (it.isHouse) house(x, r, it.bx, it.by, it.w, N, dk);
      else if (dk) {
        // Gotham: a street lamp instead of a tree
        if (N) lamp(x, it.s.x, it.s.y, N, dk);
        else lamp(x, it.s.x, it.s.y, N, dk);
      } else tree(x, it.s.x, it.s.y, it.w, N);
    }
    // lanterns at the plaza rim
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      lamp(x, cx + Math.cos(a) * (rx + 7), cy + Math.sin(a) * (ry + 5) + 2, N, dk);
    }
    if (!N) lights = lights.filter(() => false); // the day layer has no glowing lights
    return c;
  }

  // ---------- animated parts ----------
  function fireAt() {
    return [plaza.cx, plaza.cy - (mode === 'darkknight' ? 8 : 1)];
  }
  const FLAME = ['#fff3b0', '#ffd34d', '#ff9a2e', '#f2552c', '#b8301e'];
  function spawnFire(dt) {
    const [fx0, fy0] = fireAt();
    const n = Math.round(dt * 130);
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 14;
      particles.push({ k: 'flame', x: fx0 + spread, y: fy0, vx: -spread * 0.55, vy: -16 - Math.random() * 16, life: 0, max: 0.5 + Math.random() * 0.55 });
    }
    if (Math.random() < dt * 2.5) particles.push({ k: 'smoke', x: fx0, y: fy0 - 10, vx: 2 + Math.random() * 3, vy: -5 - Math.random() * 3, life: 0, max: 4 + Math.random() * 3 });
    if (Math.random() < dt * 3) particles.push({ k: 'spark', x: fx0 + (Math.random() - 0.5) * 4, y: fy0 - 4, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 14, life: 0, max: 1 + Math.random() });
  }
  function drawParticles(dt) {
    const next = [];
    for (const p of particles) {
      p.life += dt;
      if (p.life > p.max) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.life / p.max;
      if (p.k === 'flame') {
        const s = t < 0.3 ? 3 : t < 0.65 ? 2 : 1;
        R(ctx, p.x - s / 2, p.y, s, s, FLAME[Math.min(4, Math.floor(t * 5))]);
      }
      else if (p.k === 'smoke') {
        ctx.globalAlpha = (1 - t) * 0.3;
        const s = 2 + t * 5;
        R(ctx, p.x - s / 2, p.y - s / 2, s, s, '#9aa0aa');
        ctx.globalAlpha = 1;
      } else if (p.k === 'spark') {
        if (Math.random() < 0.85) P(ctx, p.x, p.y, '#ffd34d');
      } else if (p.k === 'rain') {
        R(ctx, p.x, p.y, 1, 2, 'rgba(170,190,230,0.5)');
        if (p.y > p.end) {
          if (Math.random() < 0.3) next.push({ k: 'splash', x: p.x, y: p.end, vx: 0, vy: 0, life: 0, max: 0.2 });
          continue;
        }
      } else if (p.k === 'splash') {
        P(ctx, p.x - 1, p.y, 'rgba(190,210,240,0.6)');
        P(ctx, p.x + 1, p.y, 'rgba(190,210,240,0.6)');
      } else if (p.k === 'confetti') {
        p.vy += 30 * dt;
        R(ctx, p.x, p.y, 2, 1, p.col);
      } else if (p.k === 'leaf') {
        p.vx = Math.sin(p.life * 2 + p.seed) * 6 + 6;
        R(ctx, p.x, p.y, 2, 1, p.col);
      }
      next.push(p);
    }
    particles = next;
  }
  function glow(x, y, rad, col, a) {
    if (a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col.replace('A', a));
    g.addColorStop(1, col.replace('A', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Cloud shadows drift over the village by day.
  const CLOUDS = (() => {
    const r = rng(5);
    return Array.from({ length: 4 }, () => ({ x: r() * 400, y: r() * 300, w: 40 + r() * 50, s: 3 + r() * 3 }));
  })();
  function drawWeather(dt) {
    if (night < 0.9 && mode === 'classic') {
      ctx.globalAlpha = 0.12 * (1 - night);
      for (const cl of CLOUDS) {
        const x = ((cl.x + time * cl.s) % (W + cl.w * 2)) - cl.w;
        ellipse(ctx, x, (cl.y % H), cl.w / 2, cl.w / 5, '#0c1a10');
      }
      ctx.globalAlpha = 1;
      // falling leaves
      if (Math.random() < dt * 0.8) particles.push({ k: 'leaf', x: -4, y: Math.random() * H, vx: 6, vy: 3, life: 0, max: 30, seed: Math.random() * 6, col: ['#c8a83a', '#9fc35a', '#c0672f'][Math.floor(Math.random() * 3)] });
    }
    if (mode === 'darkknight') {
      const n = Math.round(dt * (night > 0.5 ? 220 : 90));
      for (let i = 0; i < n; i++) {
        const x = Math.random() * (W + 30);
        particles.push({ k: 'rain', x, y: -3, vx: -20, vy: 160 + Math.random() * 50, life: 0, max: 3, end: Math.random() * H });
      }
    }
  }
  // Fireflies over the grass at night (Original).
  const FLIES = Array.from({ length: 18 }, (_, i) => ({ x: (i * 53) % 320, y: (i * 37) % 200, p: i }));
  function drawLife() {
    if (mode === 'classic' && night > 0.4) {
      ctx.globalAlpha = night;
      for (const f of FLIES) {
        if (Math.sin(time * 2.2 + f.p) < 0.2) continue;
        P(ctx, (f.x + Math.sin(time * 0.7 + f.p) * 8) % W, (f.y + Math.cos(time * 0.9 + f.p) * 4) % H, '#d9f99d');
      }
      ctx.globalAlpha = 1;
    }
    // birds fly over by day, bats at night
    const t = (time % 22) / 22;
    if (t < 0.45) {
      const bx = lerp(-20, W + 20, t / 0.45);
      const bat = night > 0.5;
      for (let i = 0; i < 4; i++) {
        const x = bx - i * 7;
        const y = 18 + i * 4 + Math.sin(time * 4 + i) * 2;
        const up = Math.sin(time * (bat ? 16 : 10) + i) > 0;
        const col = bat ? '#05060a' : '#2a2a2a';
        P(ctx, x - 1, y - (up ? 1 : 0), col);
        P(ctx, x, y, col);
        P(ctx, x + 1, y - (up ? 1 : 0), col);
      }
    }
  }
  // A small graveyard in the top-left corner: one stone per dead player.
  function drawGraves() {
    const n = Math.min(state.dead, 12);
    if (!n) return;
    const gx0 = 6;
    const gy0 = 8;
    R(ctx, gx0 - 3, gy0 - 4, 6 * 7 + 4, Math.ceil(n / 6) * 10 + 4, night > 0.5 ? 'rgba(10,12,20,0.35)' : 'rgba(60,40,20,0.25)');
    for (let i = 0; i < n; i++) {
      const gx = gx0 + (i % 6) * 7;
      const gy = gy0 + Math.floor(i / 6) * 10;
      R(ctx, gx, gy, 5, 6, night > 0.5 ? '#5d6270' : '#9aa0aa');
      R(ctx, gx + 1, gy - 1, 3, 1, night > 0.5 ? '#5d6270' : '#9aa0aa');
      R(ctx, gx + 2, gy + 1, 1, 3, '#3a3d46');
      R(ctx, gx + 1, gy + 2, 3, 1, '#3a3d46');
    }
  }

  // ---------- effects ----------
  function addFx(kind, data = {}) {
    fx.push({ kind, t: 0, ...data });
  }
  function drawFx(dt) {
    let shake = 0;
    let flash = 0;
    const [fx0, fy0] = fireAt();
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      e.t += dt;
      const p = e.t / e.dur;
      if (p >= 1) {
        fx.splice(i, 1);
        continue;
      }
      if (e.kind === 'lightning') {
        flash = Math.max(flash, p < 0.08 || (p > 0.15 && p < 0.22) ? 0.7 : 0);
        shake = Math.max(shake, p < 0.3 ? 2 : 0);
      } else if (e.kind === 'crows') {
        for (let k = 0; k < 7; k++) {
          const x = lerp(-30 - k * 12, W + 40, p) + Math.sin(e.t * 3 + k) * 4;
          const y = 20 + k * 5 + Math.sin(e.t * 5 + k * 2) * 3;
          const up = Math.sin(e.t * 14 + k) > 0;
          R(ctx, x - 2, y - (up ? 2 : 0), 2, 1, '#111');
          R(ctx, x, y, 2, 2, '#111');
          R(ctx, x + 2, y - (up ? 2 : 0), 2, 1, '#111');
          R(ctx, x + 1, y + 20, 2, 1, 'rgba(0,0,0,0.2)');
        }
      } else if (e.kind === 'note') {
        const x = fx0 + 18 + Math.sin(e.t * 3) * 10 * (1 - p);
        const y = lerp(-10, fy0 + 4, Math.min(1, p * 1.4));
        R(ctx, x, y, 6, 4, '#f4ecd2');
        R(ctx, x + 1, y + 1, 4, 1, '#9b8b6a');
        if (p > 0.7) glow(x + 3, y + 2, 8, 'rgba(255,240,180,A)', 0.4 * (1 - p) * 3);
      } else if (e.kind === 'police') {
        const on = Math.floor(e.t * 6) % 2;
        ctx.globalAlpha = 0.25 * (1 - p);
        R(ctx, 0, 0, W / 2, H, on ? '#ff2a2a' : '#2a5cff');
        R(ctx, W / 2, 0, W / 2, H, on ? '#2a5cff' : '#ff2a2a');
        ctx.globalAlpha = 1;
      } else if (e.kind === 'confetti' && !e.done) {
        e.done = true;
        for (let k = 0; k < 70; k++) particles.push({ k: 'confetti', x: Math.random() * W, y: -Math.random() * 30, vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 20, life: 0, max: 4, col: ['#facc15', '#22c55e', '#38bdf8', '#f472b6', '#ffffff'][k % 5] });
      } else if (e.kind === 'paws') {
        // only on the wolf's own screen: paw prints creeping across the square
        const n = Math.floor(p * 16);
        for (let k = 0; k < n; k++) {
          const x = lerp(12, W - 12, k / 16);
          const y = H - 18 - (k % 2) * 5 - Math.sin(k / 3) * 10;
          ctx.globalAlpha = Math.min(1, (1 - p) * 3) * 0.85;
          R(ctx, x, y, 3, 2, '#7f1d1d');
          P(ctx, x - 1, y - 2, '#7f1d1d');
          P(ctx, x + 1, y - 3, '#7f1d1d');
          P(ctx, x + 3, y - 2, '#7f1d1d');
          ctx.globalAlpha = 1;
        }
      } else if (e.kind === 'shield') {
        const rad = 8 + p * 50;
        ctx.globalAlpha = (1 - p) * 0.9;
        for (let a = 0; a < Math.PI * 2; a += 0.08) P(ctx, fx0 + Math.cos(a) * rad, fy0 + Math.sin(a) * rad * 0.5, '#5eead4');
        ctx.globalAlpha = 1;
      } else if (e.kind === 'magnify') {
        const a = p * Math.PI * 2;
        const x = plaza.cx + Math.cos(a) * plaza.rx * 0.9;
        const y = plaza.cy + Math.sin(a) * plaza.ry * 0.9;
        ctx.globalAlpha = 0.3 * Math.sin(p * Math.PI);
        glow(x, y, 18, 'rgba(255,255,220,A)', 1);
        ctx.globalAlpha = Math.sin(p * Math.PI);
        for (let b = 0; b < Math.PI * 2; b += 0.15) P(ctx, x + Math.cos(b) * 5, y + Math.sin(b) * 5, '#e5e7eb');
        R(ctx, x + 4, y + 4, 2, 2, '#9ca3af');
        ctx.globalAlpha = 1;
      } else if (e.kind === 'poison') {
        ctx.globalAlpha = 0.35 * Math.sin(p * Math.PI);
        for (let k = 0; k < 40; k++) {
          const x = (k * 29 + e.t * 12 * ((k % 3) + 1)) % W;
          const y = (k * 47) % H + Math.sin(e.t * 2 + k) * 6;
          R(ctx, x, y, 4, 3, k % 2 ? '#22c55e' : '#86efac');
        }
        ctx.globalAlpha = 1;
      } else if (e.kind === 'crosshair') {
        const x = plaza.cx + Math.sin(e.t * 1.7) * plaza.rx;
        const y = plaza.cy + Math.cos(e.t * 2.3) * plaza.ry;
        ctx.globalAlpha = Math.sin(p * Math.PI);
        for (let a = 0; a < Math.PI * 2; a += 0.12) P(ctx, x + Math.cos(a) * 7, y + Math.sin(a) * 7, '#ef4444');
        R(ctx, x - 10, y, 20, 1, '#ef4444');
        R(ctx, x, y - 10, 1, 20, '#ef4444');
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
    if (now - lastT < 30) return;
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.03;
    lastT = now;
    time += dt;
    const target = phase === 'night' ? 1 : 0;
    night += (target - night) * Math.min(1, dt * 1.5);
    if (Math.abs(target - night) < 0.002) night = target;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layers.day, 0, 0);
    if (night > 0) {
      ctx.globalAlpha = night;
      ctx.drawImage(layers.night, 0, 0);
      ctx.globalAlpha = 1;
      // windows and lanterns glow (they flicker a little)
      for (const l of lights) glow(l.x, l.y, l.r, l.col, l.a * night * (0.85 + Math.sin(time * 3 + l.x) * 0.15));
    }
    drawGraves();
    drawLife();
    spawnFire(dt);
    const [fx0, fy0] = fireAt();
    glow(fx0, fy0, 26 + night * 34 + Math.sin(time * 9) * 2, 'rgba(255,150,60,A)', 0.2 + night * 0.38);
    drawWeather(dt);
    drawParticles(dt);
    // a trial: a spotlight on the square
    if (state.trial) {
      ctx.globalAlpha = 0.16 + Math.sin(time * 2) * 0.04;
      ellipse(ctx, plaza.cx, plaza.cy, plaza.rx * 0.9, plaza.ry * 0.9, '#fff7d6');
      ctx.globalAlpha = 1;
    }
    // The Dark Knight at night: the bat signal sweeps over the square
    if (mode === 'darkknight' && night > 0.3) {
      const bx = plaza.cx + Math.sin(time * 0.35) * W * 0.35;
      const by = H * 0.25 + Math.cos(time * 0.27) * H * 0.12;
      glow(bx, by, 26, 'rgba(255,240,170,A)', 0.35 * night);
      ctx.globalAlpha = 0.55 * night;
      R(ctx, bx - 7, by - 1, 14, 3, '#0a0a0a');
      R(ctx, bx - 3, by - 3, 6, 6, '#0a0a0a');
      R(ctx, bx - 9, by + 1, 3, 2, '#0a0a0a');
      R(ctx, bx + 6, by + 1, 3, 2, '#0a0a0a');
      ctx.globalAlpha = 1;
    }
    const { shake, flash } = drawFx(dt);
    if (flash) {
      ctx.globalAlpha = flash;
      R(ctx, 0, 0, W, H, '#ffffff');
      ctx.globalAlpha = 1;
    }
    if (shake) canvas.style.transform = `translate(${(Math.random() - 0.5) * shake * 4}px, ${(Math.random() - 0.5) * shake * 4}px)`;
    else if (canvas.style.transform) canvas.style.transform = '';
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

  let buildKey = '';
  function build() {
    const root = canvas.parentElement;
    const cw = root.clientWidth || innerWidth;
    const ch = root.clientHeight || innerHeight;
    // Chunky pixels: about 4 screen pixels per scene pixel (a bit less on phones).
    scale = cw < 600 ? 3 : 4;
    W = Math.ceil(cw / scale);
    H = Math.ceil(ch / scale);
    const key = [mode, W, H, plaza.cx | 0, plaza.cy | 0, plaza.rx | 0].join(',');
    if (key === buildKey && layers) return;
    buildKey = key;
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    const day = drawSquare(false);
    const nightLayer = drawSquare(true);
    layers = { day, night: nightLayer };
    particles = [];
  }

  // A small pixel villager for players without a character. Same look for the same name.
  const personCache = new Map();
  function personSprite(name) {
    if (personCache.has(name)) return personCache.get(name);
    let h = 0;
    for (const ch of String(name).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const r = rng(h);
    const skin = ['#f1c9a5', '#d9a77c', '#a8714a', '#7a4b2c', '#f5d7bd'][Math.floor(r() * 5)];
    const hair = ['#2b1d14', '#5a3a22', '#c8a14a', '#8b3a1e', '#1a1a1a', '#d7d2c8'][Math.floor(r() * 6)];
    const shirt = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d68910', '#16a085', '#7f8c8d', '#c2185b'][Math.floor(r() * 8)];
    const pants = ['#2c3e50', '#5d4037', '#37474f', '#4e342e'][Math.floor(r() * 4)];
    const hat = r() < 0.35;
    const [c, x] = off(12, 22);
    const o = '#1b1b22';
    // head with outline
    R(x, 3, 2, 6, 6, o);
    R(x, 4, 3, 4, 4, skin);
    R(x, 4, 2, 4, 2, hair);
    R(x, 3, 3, 1, 2, hair);
    R(x, 8, 3, 1, 2, hair);
    P(x, 5, 5, o);
    P(x, 7, 5, o);
    if (hat) {
      R(x, 2, 1, 8, 1, '#2a2a2a');
      R(x, 4, 0, 4, 1, '#2a2a2a');
    }
    // body
    R(x, 2, 8, 8, 8, o);
    R(x, 3, 9, 6, 6, shirt);
    R(x, 3, 9, 1, 6, shade(shirt, 0.8));
    R(x, 1, 9, 2, 5, o);
    R(x, 9, 9, 2, 5, o);
    P(x, 1, 13, skin);
    P(x, 10, 13, skin);
    // legs
    R(x, 3, 16, 6, 5, o);
    R(x, 4, 16, 2, 4, pants);
    R(x, 6, 16, 2, 4, pants);
    R(x, 3, 21, 3, 1, o);
    R(x, 6, 21, 3, 1, o);
    const url = c.toDataURL();
    personCache.set(name, url);
    return url;
  }

  window.PixelScene = {
    enabled: () => enabled,
    get active() {
      return enabled && !!canvas && !canvas.classList.contains('hidden');
    },
    get scale() {
      return scale;
    },
    get plaza() {
      return plaza;
    },
    personSprite,
    setEnabled(on) {
      enabled = !!on;
      try {
        localStorage.setItem(STORE, on ? 'on' : 'off');
      } catch {}
    },
    // Where the plaza sits, in screen pixels relative to the scene (from the chat area).
    setPlaza(cx, cy, rx, ry) {
      plaza = { cx: Math.round(cx / scale), cy: Math.round(cy / scale), rx: Math.round(rx / scale), ry: Math.round(ry / scale) };
      if (canvas && !canvas.classList.contains('hidden')) build();
    },
    show(root, newMode, newPhase) {
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'scene-video pixel-scene on';
        canvas.setAttribute('aria-hidden', 'true');
        ctx = canvas.getContext('2d');
        root.prepend(canvas);
        new ResizeObserver(() => !canvas.classList.contains('hidden') && build()).observe(root);
      }
      canvas.classList.remove('hidden');
      canvas.classList.add('on');
      if (newMode !== mode) buildKey = '';
      mode = newMode;
      phase = newPhase;
      build();
      start();
    },
    hide() {
      if (!canvas) return;
      canvas.classList.add('hidden');
      canvas.classList.remove('on');
      stop();
    },
    update(s) {
      if (!s) return;
      state.dead = (s.dead || []).length;
      state.trial = !!s.trial?.open;
    },
    event(kind) {
      if (!canvas || canvas.classList.contains('hidden')) return;
      if (kind === 'death' || kind === 'guilty') {
        addFx('lightning', { dur: 1.4 });
        addFx('crows', { dur: 5 });
      } else if (kind === 'innocent') addFx('confetti', { dur: 3 });
      else if (kind === 'arrest') addFx('police', { dur: 5 });
      else if (kind === 'clue') addFx('note', { dur: 3 });
      else if (kind === 'start') {
        addFx('flash', { dur: 0.8, a: 0.4 });
        addFx('confetti', { dur: 3 });
      } else if (kind === 'my-kill') addFx('paws', { dur: 4 });
      else if (kind === 'my-vigil') addFx('crosshair', { dur: 4 });
      else if (kind === 'my-heal') addFx('shield', { dur: 2 });
      else if (kind === 'my-investigate' || kind === 'my-interrogate') addFx('magnify', { dur: 3 });
      else if (kind === 'my-poison') addFx('poison', { dur: 4 });
    },
  };
})();
