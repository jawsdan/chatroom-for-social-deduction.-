// The live village square behind the chat, drawn in code (no video, no image files).
// A round plaza seen from above with the fire in the middle, houses, trees and paths around it.
// The Dark Knight turns it into a rainy Gotham square. Players stand in a ring (see scene.js),
// walk home at night and step onto the stand when they are on trial.
// It reacts to the game: day and night, deaths, trials, arrests, clues and your own night action.
// Only things everyone may know are shown to everyone; your own night pick only shows on your screen.
// Two layers: "back" under the players (ground, houses, fire) and "front" over them (rain, rope, cage, effects).
// Switch it off in the main menu (Background) to get the videos back.
(function () {
  const STORE = 'pixelScene';
  // The moderator picks pixel village or videos for everyone (see app.js).
  let enabled = true;
  void STORE;

  let back = null;
  let front = null;
  let bx = null; // back context
  let fx2 = null; // front context
  let mode = 'classic';
  let phase = 'day';
  let W = 1280; // size in CSS pixels
  let H = 720;
  let q = 1; // canvas pixels per CSS pixel
  let night = 0;
  let bg = null; // the still village (day)
  let lightLayer = null; // windows and lamps, added at night
  let vignette = null;
  let running = false;
  let lastT = 0;
  let time = 0;
  const effects = [];
  let particles = [];
  const game = { dead: 0, trialOpen: false };
  let plaza = { cx: 640, cy: 400, rx: 300, ry: 160 };
  let houses = []; // { x, y, w, door: {x, y}, chimney: {x, y} }
  let stand = { x: 640, y: 330, h: 90 }; // where the accused stands (set by scene.js)
  let exec = null; // { name, kind: 'guilty' | 'innocent', t } while a verdict plays out

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
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => t * t * (3 - 2 * t);
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => clamp(Math.round(v * f), 0, 255);
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }
  function layer(w = W, h = H) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * q);
    c.height = Math.ceil(h * q);
    const x = c.getContext('2d');
    x.scale(q, q);
    return [c, x];
  }
  function ell(c, x, y, rx, ry, fill, stroke, lw = 2) {
    c.beginPath();
    c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.stroke();
    }
  }
  function poly(c, pts, fill, stroke, lw = 2) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.lineJoin = 'round';
      c.stroke();
    }
  }
  function rrect(c, x, y, w, h, r, fill, stroke, lw = 2) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.stroke();
    }
  }
  function glow(c, x, y, r, rgb, a) {
    if (a <= 0 || r <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const INK = '#2a1c14';

  // ---------- pieces ----------
  const ROOFS = ['#c65b3a', '#a84a35', '#5f86ad', '#7d6aa6', '#4a8a63', '#b98a3e', '#9a5278'];
  const WALLS = ['#f1e4c8', '#e6d5ae', '#ddd2bd', '#efdcbb'];
  function drawHouse(c, r, hs, lights) {
    const { x, y, w } = hs;
    const wallH = w * 0.4;
    const roofH = w * 0.5;
    const L = x - w / 2;
    const roof = ROOFS[Math.floor(r() * ROOFS.length)];
    const wall = WALLS[Math.floor(r() * WALLS.length)];
    ell(c, x + 6, y + wallH + 3, w * 0.62, w * 0.14, 'rgba(0,0,0,0.22)');
    // wall
    const wg = c.createLinearGradient(0, y, 0, y + wallH);
    wg.addColorStop(0, shade(wall, 0.86));
    wg.addColorStop(1, wall);
    rrect(c, L, y - 2, w, wallH + 2, 3, wg, INK, 2);
    // timber beams
    c.strokeStyle = '#6b4a2e';
    c.lineWidth = 3;
    c.beginPath();
    for (const fx of [0.3, 0.7]) {
      c.moveTo(L + w * fx, y);
      c.lineTo(L + w * fx, y + wallH);
    }
    c.stroke();
    // door
    const dw = w * 0.16;
    rrect(c, x - dw / 2, y + wallH - dw * 1.7, dw, dw * 1.7, [dw / 2, dw / 2, 0, 0], '#7a4a28', INK, 2);
    ell(c, x + dw * 0.22, y + wallH - dw * 0.8, 1.6, 1.6, '#f2c94c');
    // windows
    for (const fx of [0.15, 0.85]) {
      const wx = L + w * fx - w * 0.07;
      const wy = y + wallH * 0.22;
      rrect(c, wx, wy, w * 0.14, w * 0.15, 2, '#8fc4e0', INK, 2);
      c.strokeStyle = INK;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(wx + w * 0.07, wy);
      c.lineTo(wx + w * 0.07, wy + w * 0.15);
      c.stroke();
      if (r() < 0.8) lights.push({ kind: 'win', x: wx, y: wy, w: w * 0.14, h: w * 0.15 });
    }
    // roof (the front slope) with rows of tiles
    const pts = [
      [L - w * 0.07, y + 2],
      [L + w * 0.13, y - roofH],
      [L + w * 0.87, y - roofH],
      [L + w * 1.07, y + 2],
    ];
    const rg = c.createLinearGradient(0, y - roofH, 0, y);
    rg.addColorStop(0, shade(roof, 1.18));
    rg.addColorStop(1, shade(roof, 0.82));
    poly(c, pts, rg, null);
    c.save();
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath();
    c.clip();
    c.strokeStyle = shade(roof, 0.66);
    c.lineWidth = 1.2;
    for (let ty = y - roofH + 8, row = 0; ty < y + 2; ty += 8, row++) {
      c.beginPath();
      c.moveTo(L - w * 0.1, ty);
      c.lineTo(L + w * 1.1, ty);
      c.stroke();
      for (let tx = L - w * 0.1 + (row % 2 ? 6 : 0); tx < L + w * 1.1; tx += 12) {
        c.beginPath();
        c.moveTo(tx, ty - 8);
        c.lineTo(tx, ty);
        c.stroke();
      }
    }
    c.restore();
    poly(c, pts, null, INK, 2);
    c.strokeStyle = shade(roof, 1.4);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(L + w * 0.15, y - roofH + 2);
    c.lineTo(L + w * 0.85, y - roofH + 2);
    c.stroke();
    // chimney
    const cx = L + w * (0.25 + r() * 0.5);
    rrect(c, cx - 6, y - roofH - 12, 12, 20, 2, '#9a8d86', INK, 2);
    rrect(c, cx - 8, y - roofH - 15, 16, 5, 2, '#7d726c', INK, 2);
    hs.chimney = { x: cx, y: y - roofH - 16 };
    hs.door = { x, y: y + wallH + 6 };
  }
  function drawBlock(c, r, hs, lights) {
    // Gotham: a brick block with a flat roof.
    const { x, y, w } = hs;
    const wallH = w * 0.62;
    const roofH = w * 0.42;
    const L = x - w / 2;
    const base = ['#8a5a4a', '#6f7488', '#8b7356', '#5f6c84', '#7a5560'][Math.floor(r() * 5)];
    ell(c, x + 8, y + wallH + 3, w * 0.62, w * 0.13, 'rgba(0,0,0,0.3)');
    // front wall with a grid of windows
    const wg = c.createLinearGradient(0, y, 0, y + wallH);
    wg.addColorStop(0, shade(base, 0.7));
    wg.addColorStop(1, shade(base, 0.9));
    rrect(c, L, y, w, wallH, 2, wg, '#15161c', 2);
    const cols = Math.max(2, Math.round(w / 22));
    const rows = Math.max(2, Math.round(wallH / 20));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const wx = L + (w / cols) * (i + 0.5) - 5;
        const wy = y + 6 + ((wallH - 18) / rows) * j;
        if (j === rows - 1 && i === Math.floor(cols / 2)) {
          rrect(c, wx - 1, wy - 1, 12, wallH - (wy - y) + 1, 1, '#22232b', '#0e0f14', 1.5); // door
          continue;
        }
        rrect(c, wx, wy, 10, 11, 1, '#39404f', '#15161c', 1.2);
        if (r() < 0.45) lights.push({ kind: 'win', x: wx, y: wy, w: 10, h: 11 });
      }
    }
    // flat roof
    const rg = c.createLinearGradient(0, y - roofH, 0, y);
    rg.addColorStop(0, shade(base, 1.05));
    rg.addColorStop(1, shade(base, 0.8));
    rrect(c, L - 3, y - roofH, w + 6, roofH + 2, 2, rg, '#15161c', 2);
    rrect(c, L + 2, y - roofH + 5, w - 4, roofH - 8, 2, null, 'rgba(0,0,0,0.25)', 1.5);
    // things on the roof
    if (r() < 0.6) rrect(c, L + w * 0.15, y - roofH * 0.7, w * 0.2, roofH * 0.35, 2, '#8b8f99', '#15161c', 1.5);
    if (r() < 0.5) {
      const tx = L + w * 0.68;
      ell(c, tx, y - roofH * 0.45, w * 0.1, w * 0.06, '#6b4d36', '#15161c', 1.5); // water tank
      ell(c, tx, y - roofH * 0.6, w * 0.1, w * 0.05, '#7d5b40', '#15161c', 1.5);
    }
    if (r() < 0.35) lights.push({ kind: 'neon', x: L + 4, y: y + 3, w: w - 8, h: 5, col: r() < 0.5 ? '192,132,252' : '163,230,53' });
    hs.chimney = null;
    hs.door = { x, y: y + wallH + 6 };
  }
  function drawTree(c, r, x, y, s) {
    ell(c, x + s * 0.15, y + s * 0.55, s * 0.6, s * 0.2, 'rgba(0,0,0,0.2)');
    rrect(c, x - s * 0.08, y + s * 0.1, s * 0.16, s * 0.45, 2, '#6b4426', INK, 1.5);
    const g = c.createRadialGradient(x - s * 0.2, y - s * 0.35, s * 0.05, x, y - s * 0.1, s * 0.7);
    const hue = r();
    g.addColorStop(0, hue < 0.5 ? '#7ccf6a' : '#8fd06a');
    g.addColorStop(1, hue < 0.5 ? '#2f7a3a' : '#3a8a3f');
    ell(c, x, y - s * 0.12, s * 0.5, s * 0.46, g, '#1f4f29', 2);
    ell(c, x - s * 0.3, y + s * 0.05, s * 0.28, s * 0.24, g, '#1f4f29', 2);
    ell(c, x + s * 0.3, y + s * 0.04, s * 0.27, s * 0.23, g, '#1f4f29', 2);
    ell(c, x - s * 0.14, y - s * 0.3, s * 0.14, s * 0.09, 'rgba(255,255,255,0.22)');
  }
  function drawLamp(c, x, y, lights, dk) {
    ell(c, x + 2, y + 1, 7, 2.5, 'rgba(0,0,0,0.22)');
    rrect(c, x - 1.5, y - 34, 3, 35, 1, dk ? '#2b2e38' : '#4a3b28', null);
    rrect(c, x - 5, y - 44, 10, 11, 3, dk ? '#565c6b' : '#7a6541', dk ? '#15161c' : INK, 1.5);
    ell(c, x, y - 38.5, 2.6, 3.2, '#fff1b8');
    lights.push({ kind: 'lamp', x, y: y - 38, r: dk ? 80 : 70, col: dk ? '255,225,150' : '255,190,95' });
  }

  // ---------- the whole village ----------
  function buildVillage() {
    const dk = mode === 'darkknight';
    const r = rng(dk ? 44 : 17);
    const [c, x] = layer();
    const [lc, lx] = layer();
    const lights = [];
    const { cx, cy, rx, ry } = plaza;
    // ground
    const gg = x.createRadialGradient(cx, cy, rx * 0.4, cx, cy, Math.max(W, H) * 0.8);
    if (dk) {
      gg.addColorStop(0, '#7e8090');
      gg.addColorStop(1, '#5a5c6a');
    } else {
      gg.addColorStop(0, '#7cc45c');
      gg.addColorStop(1, '#4f9a44');
    }
    x.fillStyle = gg;
    x.fillRect(0, 0, W, H);
    const area = W * H;
    if (dk) {
      // cracks and stains on the asphalt, then puddles
      for (let i = 0; i < area / 9000; i++) ell(x, r() * W, r() * H, 14 + r() * 40, 6 + r() * 16, 'rgba(40,42,54,0.18)');
      x.strokeStyle = 'rgba(30,32,40,0.35)';
      x.lineWidth = 1;
      for (let i = 0; i < area / 16000; i++) {
        let px = r() * W;
        let py = r() * H;
        x.beginPath();
        x.moveTo(px, py);
        for (let k = 0; k < 4; k++) {
          px += (r() - 0.5) * 40;
          py += (r() - 0.5) * 30;
          x.lineTo(px, py);
        }
        x.stroke();
      }
    } else {
      // tufts of grass and flowers
      for (let i = 0; i < area / 260; i++) {
        const px = r() * W;
        const py = r() * H;
        x.strokeStyle = r() < 0.5 ? 'rgba(46,110,52,0.5)' : 'rgba(150,215,110,0.5)';
        x.lineWidth = 1.2;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + (r() - 0.5) * 3, py - 3 - r() * 4);
        x.stroke();
      }
      for (let i = 0; i < area / 7000; i++) ell(x, r() * W, r() * H, 12 + r() * 30, 6 + r() * 12, 'rgba(60,130,60,0.18)');
    }
    // paths from the plaza outward, like spokes
    const SPOKES = 8;
    const spokeAngle = (k) => (k / SPOKES) * Math.PI * 2 + Math.PI / SPOKES;
    for (const [lw, col] of dk ? [[40, '#4a4c58'], [34, '#8d8f9c']] : [[40, '#a98f63'], [33, '#d9c08f']]) {
      x.strokeStyle = col;
      x.lineWidth = lw * clamp(rx / 300, 0.6, 1);
      x.lineCap = 'round';
      for (let k = 0; k < SPOKES; k++) {
        const a = spokeAngle(k);
        const far = Math.max(W, H);
        x.beginPath();
        x.moveTo(cx + Math.cos(a) * rx * 0.95, cy + Math.sin(a) * ry * 0.95);
        const bend = (k % 2 ? 1 : -1) * 0.12;
        x.quadraticCurveTo(cx + Math.cos(a + bend) * (rx + far * 0.3), cy + Math.sin(a + bend) * (ry + far * 0.3 * (ry / rx)), cx + Math.cos(a) * (rx + far), cy + Math.sin(a) * (ry + far) * (ry / rx) * 1.6);
        x.stroke();
      }
    }
    if (dk) {
      // dashed road lines
      x.strokeStyle = 'rgba(240,220,140,0.55)';
      x.lineWidth = 2;
      x.setLineDash([12, 14]);
      for (let k = 0; k < SPOKES; k += 2) {
        const a = spokeAngle(k);
        x.beginPath();
        x.moveTo(cx + Math.cos(a) * rx * 1.1, cy + Math.sin(a) * ry * 1.1);
        x.lineTo(cx + Math.cos(a) * (rx + W), cy + Math.sin(a) * (ry + W) * (ry / rx) * 1.6);
        x.stroke();
      }
      x.setLineDash([]);
    }
    // the plaza: rings of cobblestones
    ell(x, cx, cy + 6, rx + 12, ry + 9, 'rgba(0,0,0,0.25)');
    ell(x, cx, cy, rx + 10, ry + 7, dk ? '#4b4d5a' : '#857868', dk ? '#22232b' : '#4a4036', 2.5);
    const stone = dk ? '#8b8d9a' : '#b8ab9a';
    ell(x, cx, cy, rx, ry, shade(stone, 0.78));
    x.save();
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    x.clip();
    const ringW = clamp(rx / 16, 9, 18);
    for (let f = ringW * 0.5, i = 0; f < rx + ringW; f += ringW, i++) {
      for (const [dash, alpha] of [[[ringW * 1.5, 3], 1], [[ringW * 0.7, ringW * 2.3 + 3], 0.5]]) {
        x.setLineDash(dash);
        x.lineDashOffset = r() * 60;
        x.strokeStyle = alpha === 1 ? shade(stone, 0.92 + r() * 0.16) : `rgba(255,255,255,${0.1 + r() * 0.12})`;
        x.lineWidth = ringW - 3;
        x.beginPath();
        x.ellipse(cx, cy, f, f * (ry / rx), 0, 0, Math.PI * 2);
        x.stroke();
      }
    }
    x.setLineDash([]);
    // a soft light in the middle and shade towards the rim
    const pg = x.createRadialGradient(cx, cy, 0, cx, cy, rx);
    pg.addColorStop(0, 'rgba(255,240,200,0.16)');
    pg.addColorStop(0.7, 'rgba(0,0,0,0)');
    pg.addColorStop(1, 'rgba(0,0,0,0.22)');
    x.fillStyle = pg;
    x.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    x.restore();
    // the fire place in the middle
    const fr = clamp(rx * 0.11, 20, 38);
    ell(x, cx, cy, fr * 1.5, fr * 0.85, dk ? '#3a3c47' : '#5f5142', dk ? '#1b1c22' : '#3a3026', 2);
    if (dk) {
      // an oil drum
      rrect(x, cx - fr * 0.55, cy - fr * 1.1, fr * 1.1, fr * 1.25, 4, '#5a5f6b', '#15161c', 2);
      ell(x, cx, cy - fr * 1.1, fr * 0.55, fr * 0.2, '#2a2c33', '#15161c', 2);
      x.strokeStyle = '#3d414b';
      x.lineWidth = 2;
      for (const f of [0.35, 0.7]) {
        x.beginPath();
        x.moveTo(cx - fr * 0.55, cy - fr * 1.1 + fr * 1.25 * f);
        x.lineTo(cx + fr * 0.55, cy - fr * 1.1 + fr * 1.25 * f);
        x.stroke();
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ell(x, cx + Math.cos(a) * fr * 1.15, cy + Math.sin(a) * fr * 0.62, fr * 0.2, fr * 0.15, i % 2 ? '#9a9fa8' : '#b3b8c1', '#4a4e57', 1.5);
      }
      x.lineCap = 'round';
      for (const [a, col] of [[0.4, '#6b4426'], [-0.5, '#7a5030'], [2.2, '#5c3a20']]) {
        x.strokeStyle = INK;
        x.lineWidth = fr * 0.32;
        x.beginPath();
        x.moveTo(cx - Math.cos(a) * fr * 0.7, cy - Math.sin(a) * fr * 0.3);
        x.lineTo(cx + Math.cos(a) * fr * 0.7, cy + Math.sin(a) * fr * 0.3);
        x.stroke();
        x.strokeStyle = col;
        x.lineWidth = fr * 0.22;
        x.stroke();
      }
    }
    // houses: a first ring between the paths, then more further out
    houses = [];
    const hw = clamp(rx * 0.34, 62, 118);
    const tryPlace = (hx, hy, w) => {
      if (hx < -w || hy < -w || hx > W + w || hy > H + w) return null;
      const ex = (hx - cx) / (rx + w * 0.62);
      const ey = (hy + w * 0.2 - cy) / (ry + w * 0.72);
      if (ex * ex + ey * ey < 1) return null;
      if (houses.some((o) => Math.abs(o.x - hx) < (o.w + w) * 0.58 && Math.abs(o.y - hy) < (o.w + w) * 0.62)) return null;
      const hs = { x: hx, y: hy, w };
      houses.push(hs);
      return hs;
    };
    for (let k = 0; k < SPOKES; k++) {
      const a = (k / SPOKES) * Math.PI * 2;
      const w = hw * (0.9 + r() * 0.2);
      tryPlace(cx + Math.cos(a) * (rx + w * 0.95), cy + Math.sin(a) * (ry + w * 1.05) - w * 0.1, w);
    }
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2;
      const d = 1.2 + r() * 2.2;
      const w = hw * (0.75 + r() * 0.3);
      // not on a path
      let onPath = false;
      for (let k = 0; k < SPOKES; k++) {
        let da = Math.abs(((a - spokeAngle(k) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < 0.2) onPath = true;
      }
      if (onPath) continue;
      tryPlace(cx + Math.cos(a) * (rx + w) * d, cy + Math.sin(a) * (ry + w) * d, w);
    }
    // trees, bushes and rocks in the gaps (Gotham: street lamps and hydrants)
    const deco = [];
    for (let i = 0; i < area / 9000; i++) {
      const px = r() * W;
      const py = r() * H;
      const ex = (px - cx) / (rx + 46);
      const ey = (py - cy) / (ry + 50);
      if (ex * ex + ey * ey < 1) continue;
      if (houses.some((o) => Math.abs(o.x - px) < o.w * 0.75 && py > o.y - o.w * 0.8 && py < o.y + o.w * 0.75)) continue;
      const a = Math.atan2((py - cy) / ry, (px - cx) / rx);
      let onPath = false;
      for (let k = 0; k < SPOKES; k++) if (Math.abs(((a - spokeAngle(k) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.13) onPath = true;
      if (onPath) continue;
      deco.push({ x: px, y: py, kind: r() });
    }
    const all = [...houses.map((h) => ({ y: h.y + h.w * 0.4, h })), ...deco.map((d) => ({ y: d.y, d }))].sort((a, b) => a.y - b.y);
    for (const it of all) {
      if (it.h) (dk ? drawBlock : drawHouse)(x, r, it.h, lights);
      else if (dk) {
        if (it.d.kind < 0.35) drawLamp(x, it.d.x, it.d.y, lights, true);
        else if (it.d.kind < 0.5) {
          rrect(x, it.d.x - 4, it.d.y - 12, 8, 13, 3, '#c0392b', '#15161c', 1.5); // hydrant
          ell(x, it.d.x, it.d.y - 13, 4, 3, '#d9483b', '#15161c', 1.5);
        } else ell(x, it.d.x, it.d.y, 16 + it.d.kind * 22, 5 + it.d.kind * 6, 'rgba(120,140,175,0.5)', 'rgba(200,215,240,0.35)', 1.5); // puddle
      } else if (it.d.kind < 0.55) drawTree(x, r, it.d.x, it.d.y, 34 + it.d.kind * 50);
      else if (it.d.kind < 0.8) {
        ell(x, it.d.x + 2, it.d.y + 5, 15, 5, 'rgba(0,0,0,0.18)'); // bush
        ell(x, it.d.x, it.d.y, 13, 10, '#4a9c4a', '#1f4f29', 2);
        ell(x, it.d.x + 9, it.d.y + 2, 9, 7, '#5fb357', '#1f4f29', 2);
        if (it.d.kind < 0.68) for (let k = 0; k < 4; k++) ell(x, it.d.x - 6 + k * 5, it.d.y - 2 + (k % 2) * 4, 1.8, 1.8, ['#f08fb0', '#ffffff', '#f3d24c'][k % 3]);
      } else {
        ell(x, it.d.x + 2, it.d.y + 4, 11, 4, 'rgba(0,0,0,0.18)'); // rock
        ell(x, it.d.x, it.d.y, 10, 7, '#a3a8b1', '#555a64', 2);
        ell(x, it.d.x - 3, it.d.y - 2, 4, 2.5, 'rgba(255,255,255,0.35)');
      }
    }
    // lanterns around the plaza
    for (let k = 0; k < SPOKES; k++) {
      const a = (k / SPOKES) * Math.PI * 2;
      drawLamp(x, cx + Math.cos(a) * (rx + 20), cy + Math.sin(a) * (ry + 14) + 4, lights, dk);
    }
    // the night lights, drawn once
    for (const l of lights) {
      if (l.kind === 'win') {
        lx.fillStyle = 'rgba(255,214,120,0.95)';
        lx.fillRect(l.x, l.y, l.w, l.h);
        glow(lx, l.x + l.w / 2, l.y + l.h / 2, 34, '255,200,110', 0.35);
      } else if (l.kind === 'lamp') {
        glow(lx, l.x, l.y, l.r, l.col, 0.55);
        glow(lx, l.x, l.y + 38, l.r * 0.8, l.col, 0.25);
      } else if (l.kind === 'neon') {
        lx.fillStyle = `rgba(${l.col},0.95)`;
        lx.fillRect(l.x, l.y, l.w, l.h);
        glow(lx, l.x + l.w / 2, l.y + 4, l.w * 0.8, l.col, 0.4);
      }
    }
    bg = c;
    lightLayer = lc;
    // a soft dark edge around the screen
    const [vc, vx] = layer();
    const vg = vx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,10,0.45)');
    vx.fillStyle = vg;
    vx.fillRect(0, 0, W, H);
    vignette = vc;
  }

  // ---------- moving things ----------
  function firePos() {
    const fr = clamp(plaza.rx * 0.11, 20, 38);
    return [plaza.cx, plaza.cy - (mode === 'darkknight' ? fr * 1.05 : 2), fr];
  }
  function spawn(dt) {
    const [fx0, fy0, fr] = firePos();
    for (let i = 0; i < Math.round(dt * 90); i++) {
      const s = (Math.random() - 0.5) * fr * 0.9;
      particles.push({ k: 'flame', x: fx0 + s, y: fy0, vx: -s * 0.9, vy: -(fr * 1.6) - Math.random() * fr * 1.6, life: 0, max: 0.5 + Math.random() * 0.5, r: fr * (0.22 + Math.random() * 0.2) });
    }
    if (Math.random() < dt * 5) particles.push({ k: 'spark', x: fx0 + (Math.random() - 0.5) * fr * 0.6, y: fy0 - fr * 0.4, vx: (Math.random() - 0.5) * 50, vy: -70 - Math.random() * 60, life: 0, max: 1 + Math.random() });
    if (Math.random() < dt * 6) particles.push({ k: 'smoke', x: fx0, y: fy0 - fr * 1.6, vx: 8 + Math.random() * 10, vy: -22 - Math.random() * 12, life: 0, max: 4 + Math.random() * 3, r: fr * 0.3 });
    // chimney smoke
    for (const h of houses) {
      if (h.chimney && Math.random() < dt * 0.9) particles.push({ k: 'smoke', x: h.chimney.x, y: h.chimney.y, vx: 5 + Math.random() * 6, vy: -14 - Math.random() * 8, life: 0, max: 4 + Math.random() * 2, r: 5 });
    }
    if (mode === 'classic' && night < 0.6 && Math.random() < dt * 1.2) particles.push({ k: 'leaf', x: -10, y: Math.random() * H, vx: 30, vy: 12, life: 0, max: 40, seed: Math.random() * 6, col: ['#d8b23e', '#a9cc5e', '#cf7434'][Math.floor(Math.random() * 3)] });
  }
  function drawBackParticles(dt) {
    const next = [];
    for (const p of particles) {
      p.life += dt;
      if (p.life > p.max) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const t = p.life / p.max;
      if (p.k === 'flame') {
        bx.globalCompositeOperation = 'lighter';
        const col = t < 0.25 ? '255,236,170' : t < 0.55 ? '255,170,60' : '230,80,40';
        ell(bx, p.x, p.y, p.r * (1 - t * 0.7), p.r * (1 - t * 0.7), `rgba(${col},${0.55 * (1 - t)})`);
        bx.globalCompositeOperation = 'source-over';
      } else if (p.k === 'spark') {
        ell(bx, p.x, p.y, 1.6, 1.6, `rgba(255,220,120,${1 - t})`);
      } else if (p.k === 'smoke') {
        ell(bx, p.x, p.y, p.r * (1 + t * 2.2), p.r * (1 + t * 2.2), `rgba(190,195,205,${0.22 * (1 - t)})`);
      } else if (p.k === 'leaf') {
        p.vx = 26 + Math.sin(p.life * 2 + p.seed) * 22;
        p.vy = 10 + Math.cos(p.life * 3 + p.seed) * 14;
        bx.save();
        bx.translate(p.x, p.y);
        bx.rotate(p.life * 2 + p.seed);
        ell(bx, 0, 0, 4, 2, p.col);
        bx.restore();
      } else if (p.k === 'ripple') {
        ell(bx, p.x, p.y, 2 + t * 9, 1 + t * 4, null, `rgba(200,215,240,${0.4 * (1 - t)})`, 1);
      }
      next.push(p);
    }
    particles = next;
  }
  const CLOUDS = Array.from({ length: 4 }, (_, i) => ({ x: i * 500, y: 80 + i * 170, w: 260 + i * 60, s: 12 + i * 4 }));
  const FLIES = Array.from({ length: 26 }, (_, i) => ({ x: (i * 211) % 1600, y: (i * 137) % 1000, p: i * 1.7 }));
  function drawAmbience() {
    if (mode === 'classic' && night < 0.9) {
      for (const cl of CLOUDS) {
        const x = ((cl.x + time * cl.s) % (W + cl.w * 2)) - cl.w;
        glow(bx, x, cl.y % H, cl.w * 0.6, '20,50,30', 0.16 * (1 - night));
      }
    }
    if (mode === 'classic' && night > 0.3) {
      for (const f of FLIES) {
        const tw = Math.sin(time * 2 + f.p);
        if (tw < 0) continue;
        const x = (f.x + Math.sin(time * 0.5 + f.p) * 30) % W;
        const y = (f.y + Math.cos(time * 0.7 + f.p) * 18) % H;
        glow(bx, x, y, 9, '217,249,157', 0.5 * tw * night);
        ell(bx, x, y, 1.4, 1.4, `rgba(236,252,203,${tw * night})`);
      }
    }
  }
  // A small graveyard in the top-left of the village: one stone per dead player.
  function drawGraves() {
    const n = Math.min(game.dead, 12);
    for (let i = 0; i < n; i++) {
      const gx = 26 + (i % 6) * 30;
      const gy = H * 0.24 + Math.floor(i / 6) * 40;
      ell(bx, gx + 2, gy + 14, 12, 4, 'rgba(0,0,0,0.25)');
      rrect(bx, gx - 9, gy - 12, 18, 26, [9, 9, 2, 2], '#a9aeb8', '#4b4f59', 2);
      bx.strokeStyle = '#4b4f59';
      bx.lineWidth = 2;
      bx.beginPath();
      bx.moveTo(gx, gy - 6);
      bx.lineTo(gx, gy + 4);
      bx.moveTo(gx - 4, gy - 2);
      bx.lineTo(gx + 4, gy - 2);
      bx.stroke();
    }
  }
  // The stand where the accused stands (under the players).
  function drawStandBack(a) {
    if (a <= 0) return;
    const { x, y, h } = stand;
    const w = h * 1.25;
    bx.globalAlpha = a;
    ell(bx, x + 4, y + 12, w * 0.62, 9, 'rgba(0,0,0,0.3)');
    if (mode === 'darkknight') {
      rrect(bx, x - w / 2, y - 8, w, 16, 3, '#5d6270', '#15161c', 2);
      bx.strokeStyle = '#f2c94c';
      bx.lineWidth = 3;
      bx.setLineDash([8, 8]);
      bx.strokeRect(x - w / 2 + 3, y - 5, w - 6, 3);
      bx.setLineDash([]);
    } else {
      // a wooden platform with steps
      rrect(bx, x - w / 2, y - 8, w, 18, 3, '#9a6c42', INK, 2);
      bx.strokeStyle = '#6b4426';
      bx.lineWidth = 1.5;
      for (let i = 1; i < 6; i++) {
        bx.beginPath();
        bx.moveTo(x - w / 2 + (w / 6) * i, y - 8);
        bx.lineTo(x - w / 2 + (w / 6) * i, y + 2);
        bx.stroke();
      }
      rrect(bx, x - w / 2, y + 2, w, 8, 2, '#7a5030', INK, 2);
      rrect(bx, x - w * 0.75, y + 2, w * 0.25, 6, 2, '#8a5c38', INK, 2);
    }
    bx.globalAlpha = 1;
  }
  // The gallows (Original) or the cage (The Dark Knight), over the players.
  function drawStandFront(a) {
    if (a <= 0) return;
    const { x, y, h } = stand;
    const c = fx2;
    c.globalAlpha = a;
    const t = exec ? (performance.now() - exec.t) / 1000 : 0;
    const guilty = exec?.kind === 'guilty';
    if (mode === 'darkknight') {
      if (guilty) {
        // a cage drops over the villain, then is hauled away
        const down = ease(clamp(t / 0.6, 0, 1));
        const lift = t > 2.6 ? ease(clamp((t - 2.6) / 0.9, 0, 1)) : 0;
        const top = lerp(-h * 2.4, y - h * 1.2, down) - lift * (y + h);
        const cw = h * 1.05;
        c.strokeStyle = '#1b1d24';
        c.lineWidth = 4;
        for (let i = 0; i <= 6; i++) {
          const bxp = x - cw / 2 + (cw / 6) * i;
          c.beginPath();
          c.moveTo(bxp, top);
          c.lineTo(bxp, top + h * 1.28);
          c.stroke();
        }
        rrect(c, x - cw / 2 - 4, top - 6, cw + 8, 9, 3, '#3a3d48', '#15161c', 2);
        rrect(c, x - cw / 2 - 4, top + h * 1.26, cw + 8, 8, 3, '#3a3d48', '#15161c', 2);
        // the chain
        c.strokeStyle = '#2b2e38';
        c.lineWidth = 3;
        c.setLineDash([6, 4]);
        c.beginPath();
        c.moveTo(x, top - 6);
        c.lineTo(x, -10);
        c.stroke();
        c.setLineDash([]);
      }
    } else {
      // post, beam and rope
      const px = x + h * 0.62;
      const topY = y - h * 1.5;
      c.lineCap = 'round';
      for (const [lw, col] of [[11, INK], [7, '#8a5c38']]) {
        c.strokeStyle = col;
        c.lineWidth = lw;
        c.beginPath();
        c.moveTo(px, y + 4);
        c.lineTo(px, topY);
        c.lineTo(x - h * 0.1, topY);
        c.moveTo(px, topY + h * 0.35);
        c.lineTo(px - h * 0.35, topY);
        c.stroke();
      }
      // the rope: slack until the verdict, tight when guilty
      const drop = guilty ? ease(clamp((t - 0.5) / 0.25, 0, 1)) : 0;
      const sway = guilty && t > 0.75 ? Math.sin((t - 0.75) * 5) * 5 * Math.max(0, 1 - (t - 0.75) / 3) : Math.sin(time * 1.5) * 2;
      const endY = y - h * (guilty ? 0.86 : 1.02) + drop * 9;
      c.strokeStyle = '#d9c08f';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x, topY);
      c.quadraticCurveTo(x + sway * 0.5, (topY + endY) / 2, x + sway, endY);
      c.stroke();
      if (!guilty) ell(c, x + sway, endY + 7, 6, 8, null, '#d9c08f', 3); // the noose, waiting
    }
    c.globalAlpha = 1;
  }

  // ---------- effects (over the players) ----------
  function addFx(kind, data = {}) {
    effects.push({ kind, t: 0, ...data });
  }
  let rain = [];
  function drawFront(dt) {
    const c = fx2;
    c.clearRect(0, 0, W, H);
    // rain over Gotham
    if (mode === 'darkknight') {
      const want = Math.round((W * H) / (night > 0.5 ? 5200 : 12000));
      while (rain.length < want) rain.push({ x: Math.random() * (W + 200), y: Math.random() * H, v: 700 + Math.random() * 400, len: 10 + Math.random() * 12 });
      if (rain.length > want) rain.length = want;
      c.strokeStyle = 'rgba(190,210,245,0.38)';
      c.lineWidth = 1.2;
      c.beginPath();
      for (const d of rain) {
        d.y += d.v * dt;
        d.x -= d.v * 0.22 * dt;
        if (d.y > H) {
          if (Math.random() < 0.25) particles.push({ k: 'ripple', x: d.x, y: Math.random() * H, vx: 0, vy: 0, life: 0, max: 0.5 });
          d.y = -20;
          d.x = Math.random() * (W + 200);
        }
        c.moveTo(d.x, d.y);
        c.lineTo(d.x - d.len * 0.22, d.y + d.len);
      }
      c.stroke();
    } else rain = [];
    // the trial: a light on the stand
    const trialOn = game.trialOpen || !!exec;
    standAlpha += ((trialOn ? 1 : 0) - standAlpha) * Math.min(1, dt * 4);
    if (standAlpha > 0.01) {
      const { x, y, h } = stand;
      c.globalAlpha = standAlpha * (0.2 + night * 0.12);
      c.fillStyle = '#fff3c4';
      c.beginPath();
      c.moveTo(x - 14, 0);
      c.lineTo(x + 14, 0);
      c.lineTo(x + h * 0.95, y + 14);
      c.lineTo(x - h * 0.95, y + 14);
      c.fill();
      c.globalAlpha = 1;
      drawStandFront(standAlpha);
    }
    // The Dark Knight at night: the bat signal sweeps over the city
    if (mode === 'darkknight' && night > 0.3) {
      const sx = W * 0.5 + Math.sin(time * 0.3) * W * 0.32;
      const sy = H * 0.2 + Math.cos(time * 0.23) * H * 0.08;
      glow(c, sx, sy, 110, '255,240,170', 0.3 * night);
      c.globalAlpha = 0.6 * night;
      c.fillStyle = '#0a0a0e';
      c.beginPath();
      c.moveTo(sx - 38, sy - 2);
      c.quadraticCurveTo(sx - 22, sy - 16, sx - 9, sy - 6);
      c.lineTo(sx - 5, sy - 15);
      c.lineTo(sx, sy - 8);
      c.lineTo(sx + 5, sy - 15);
      c.lineTo(sx + 9, sy - 6);
      c.quadraticCurveTo(sx + 22, sy - 16, sx + 38, sy - 2);
      c.quadraticCurveTo(sx + 24, sy + 2, sx + 18, sy + 12);
      c.quadraticCurveTo(sx + 9, sy + 4, sx, sy + 16);
      c.quadraticCurveTo(sx - 9, sy + 4, sx - 18, sy + 12);
      c.quadraticCurveTo(sx - 24, sy + 2, sx - 38, sy - 2);
      c.fill();
      c.globalAlpha = 1;
    }
    // birds by day, bats by night
    const cyc = (time % 24) / 24;
    if (cyc < 0.4) {
      const bxp = lerp(-60, W + 60, cyc / 0.4);
      c.strokeStyle = night > 0.5 ? '#07080c' : '#30303a';
      c.lineWidth = 2;
      c.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const x = bxp - i * 26 - (i % 2) * 8;
        const y = H * 0.14 + i * 13 + Math.sin(time * 3 + i) * 6;
        const f = Math.sin(time * (night > 0.5 ? 18 : 11) + i) * 5;
        c.beginPath();
        c.moveTo(x - 8, y - f);
        c.quadraticCurveTo(x - 3, y - 2, x, y);
        c.quadraticCurveTo(x + 3, y - 2, x + 8, y - f);
        c.stroke();
      }
    }
    let shake = 0;
    let flash = 0;
    const [fx0, fy0] = firePos();
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      const p = e.t / e.dur;
      if (p >= 1) {
        effects.splice(i, 1);
        continue;
      }
      if (e.kind === 'lightning') {
        flash = Math.max(flash, p < 0.07 || (p > 0.14 && p < 0.2) ? 0.65 : 0);
        shake = Math.max(shake, p < 0.3 ? 5 : 0);
        if (p < 0.2) {
          c.strokeStyle = '#f4f6ff';
          c.lineWidth = 3;
          c.beginPath();
          let lx = e.x;
          c.moveTo(lx, 0);
          for (let y = 0; y < e.y; y += 26) {
            lx += (Math.random() - 0.5) * 44;
            c.lineTo(lx, y);
          }
          c.stroke();
        }
      } else if (e.kind === 'crows') {
        c.strokeStyle = '#0c0c10';
        c.lineWidth = 3;
        c.lineCap = 'round';
        for (let k = 0; k < 8; k++) {
          const x = lerp(-80 - k * 46, W + 120, p) + Math.sin(e.t * 3 + k) * 14;
          const y = H * 0.22 + k * 20 + Math.sin(e.t * 5 + k * 2) * 12;
          const f = Math.sin(e.t * 15 + k) * 9;
          c.beginPath();
          c.moveTo(x - 13, y - f);
          c.quadraticCurveTo(x - 4, y - 3, x, y);
          c.quadraticCurveTo(x + 4, y - 3, x + 13, y - f);
          c.stroke();
          ell(c, x, y + 1, 3.5, 2.5, '#0c0c10');
        }
      } else if (e.kind === 'note') {
        const x = fx0 + 70 + Math.sin(e.t * 3) * 40 * (1 - p);
        const y = lerp(-30, fy0 + 10, Math.min(1, p * 1.4));
        c.save();
        c.translate(x, y);
        c.rotate(Math.sin(e.t * 4) * 0.4 * (1 - p));
        rrect(c, -13, -9, 26, 18, 2, '#f4ecd2', '#8a7a58', 1.5);
        c.strokeStyle = '#8a7a58';
        c.lineWidth = 1.5;
        for (const ly of [-4, 0, 4]) {
          c.beginPath();
          c.moveTo(-8, ly);
          c.lineTo(ly === 4 ? 3 : 8, ly);
          c.stroke();
        }
        c.restore();
        if (p > 0.7) glow(c, x, y, 40, '255,240,180', 0.5 * (1 - p) * 3);
      } else if (e.kind === 'police') {
        const on = Math.floor(e.t * 6) % 2;
        c.globalAlpha = 0.22 * (1 - p);
        c.fillStyle = on ? '#ff2a2a' : '#2a5cff';
        c.fillRect(0, 0, W / 2, H);
        c.fillStyle = on ? '#2a5cff' : '#ff2a2a';
        c.fillRect(W / 2, 0, W / 2, H);
        c.globalAlpha = 1;
      } else if (e.kind === 'confetti') {
        if (!e.bits) e.bits = Array.from({ length: 110 }, (_, k) => ({ x: Math.random() * W, y: -Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160, rot: Math.random() * 6, col: ['#facc15', '#22c55e', '#38bdf8', '#f472b6', '#ffffff', '#fb923c'][k % 6] }));
        for (const b of e.bits) {
          b.x += b.vx * dt + Math.sin(e.t * 3 + b.rot) * 1.2;
          b.y += b.vy * dt;
          b.rot += dt * 6;
          c.save();
          c.translate(b.x, b.y);
          c.rotate(b.rot);
          c.globalAlpha = Math.min(1, (1 - p) * 3);
          c.fillStyle = b.col;
          c.fillRect(-4, -2, 8, 4);
          c.restore();
        }
      } else if (e.kind === 'paws') {
        // only on the wolf's own screen: paw prints creeping across the square
        const n = Math.floor(p * 14);
        c.fillStyle = '#7f1d1d';
        for (let k = 0; k < n; k++) {
          const x = lerp(W * 0.08, W * 0.92, k / 14);
          const y = H * 0.86 - (k % 2) * 22 - Math.sin(k / 3) * 30;
          c.globalAlpha = Math.min(1, (1 - p) * 3) * 0.8;
          ell(c, x, y, 7, 6, '#7f1d1d');
          for (const [dx, dy] of [[-8, -8], [-3, -12], [3, -12], [8, -8]]) ell(c, x + dx, y + dy, 2.8, 3.4, '#7f1d1d');
        }
        c.globalAlpha = 1;
      } else if (e.kind === 'shield') {
        const rad = 30 + p * 240;
        c.globalAlpha = (1 - p) * 0.9;
        ell(c, fx0, fy0, rad, rad * 0.55, null, '#5eead4', 4);
        ell(c, fx0, fy0, rad * 0.7, rad * 0.38, null, 'rgba(94,234,212,0.5)', 2);
        c.globalAlpha = 1;
      } else if (e.kind === 'magnify') {
        const a = p * Math.PI * 2 + Math.PI / 2;
        const x = plaza.cx + Math.cos(a) * plaza.rx * 0.92;
        const y = plaza.cy + Math.sin(a) * plaza.ry * 0.92 - 30;
        const al = Math.sin(p * Math.PI);
        glow(c, x, y, 70, '255,255,220', 0.35 * al);
        c.globalAlpha = al;
        ell(c, x, y, 22, 22, 'rgba(200,230,255,0.18)', '#e5e7eb', 4);
        c.strokeStyle = '#9ca3af';
        c.lineWidth = 6;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x + 16, y + 16);
        c.lineTo(x + 32, y + 32);
        c.stroke();
        c.globalAlpha = 1;
      } else if (e.kind === 'poison') {
        const al = Math.sin(p * Math.PI);
        for (let k = 0; k < 26; k++) {
          const x = (k * 137 + e.t * 40 * ((k % 3) + 1)) % (W + 100) - 50;
          const y = (k * 211) % H + Math.sin(e.t * 2 + k) * 20;
          glow(c, x, y, 50 + (k % 4) * 14, k % 2 ? '34,197,94' : '134,239,172', 0.22 * al);
        }
      } else if (e.kind === 'crosshair') {
        const x = plaza.cx + Math.sin(e.t * 1.7) * plaza.rx * 0.9;
        const y = plaza.cy + Math.cos(e.t * 2.3) * plaza.ry * 0.9 - 30;
        c.globalAlpha = Math.sin(p * Math.PI);
        ell(c, x, y, 28, 28, null, '#ef4444', 3);
        c.strokeStyle = '#ef4444';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x - 40, y);
        c.lineTo(x + 40, y);
        c.moveTo(x, y - 40);
        c.lineTo(x, y + 40);
        c.stroke();
        c.globalAlpha = 1;
      } else if (e.kind === 'flash') flash = Math.max(flash, (1 - p) * (e.a || 0.5));
      else if (e.kind === 'banner') {
        // a short title across the screen, like a game announcement
        const al = Math.min(1, p * 6, (1 - p) * 4);
        c.globalAlpha = al * 0.55;
        c.fillStyle = '#0b0d1a';
        c.fillRect(0, H * 0.16 - 30, W, 60);
        c.globalAlpha = al;
        c.fillStyle = e.col || '#ffffff';
        c.font = `800 ${Math.round(clamp(W / 26, 20, 40))}px Inter, system-ui, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(e.text, W / 2 + (1 - Math.min(1, p * 5)) * -40, H * 0.16);
        c.globalAlpha = 1;
      }
    }
    if (flash) {
      c.globalAlpha = flash;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
    const tr = shake ? `translate(${(Math.random() - 0.5) * shake * 2}px, ${(Math.random() - 0.5) * shake * 2}px)` : '';
    if (back.style.transform !== tr) back.style.transform = tr;
  }
  let standAlpha = 0;
  let composed = null;
  let cx2 = null;
  let composedKey = '';

  // ---------- the loop ----------
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - lastT < 30) return;
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.03;
    lastT = now;
    time += dt;
    const target = phase === 'night' ? 1 : 0;
    night += (target - night) * Math.min(1, dt * 1.2);
    if (Math.abs(target - night) < 0.002) night = target;
    if (exec && now - exec.t > exec.dur) {
      exec = null;
      window.sceneRelayout?.();
    }

    // The still picture (village + night + lights + graves) is only put together again when it changes.
    const nq = Math.round(night * 40) / 40;
    const ck = nq + '|' + game.dead;
    if (ck !== composedKey) {
      composedKey = ck;
      if (!composed || composed.width !== bg.width || composed.height !== bg.height) [composed, cx2] = layer();
      const c = cx2;
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.drawImage(bg, 0, 0, W, H);
      const keep = bx;
      bx = c;
      drawGraves();
      bx = keep;
      if (nq > 0) {
        // the dark of night, then the warm lights on top
        c.globalCompositeOperation = 'multiply';
        c.fillStyle = mode === 'darkknight' ? `rgba(38,44,84,${nq * 0.86})` : `rgba(34,48,98,${nq * 0.84})`;
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = nq * 0.92;
        c.drawImage(lightLayer, 0, 0, W, H);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
      c.drawImage(vignette, 0, 0, W, H);
    }
    bx.globalCompositeOperation = 'source-over';
    bx.globalAlpha = 1;
    bx.drawImage(composed, 0, 0, W, H);
    drawStandBack(standAlpha);
    drawAmbience();
    spawn(dt);
    const [fx0, fy0, fr] = firePos();
    bx.globalCompositeOperation = 'lighter';
    glow(bx, fx0, fy0, fr * (4 + night * 4) + Math.sin(time * 9) * 6, '255,140,50', 0.14 + night * 0.2);
    bx.globalCompositeOperation = 'source-over';
    drawBackParticles(dt);
    drawFront(dt);
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
    if (!back || back.classList.contains('hidden')) return;
    if (document.hidden) stop();
    else start();
  });

  let buildKey = '';
  function build() {
    const root = back.parentElement;
    W = root.clientWidth || innerWidth;
    H = root.clientHeight || innerHeight;
    q = Math.min(window.devicePixelRatio || 1, W > 1300 ? 1 : 2);
    const key = [mode, W, H, q, plaza.cx | 0, plaza.cy | 0, plaza.rx | 0, plaza.ry | 0].join(',');
    if (key === buildKey && bg) return;
    buildKey = key;
    for (const cv of [back, front]) {
      cv.width = Math.ceil(W * q);
      cv.height = Math.ceil(H * q);
    }
    bx.setTransform(q, 0, 0, q, 0, 0);
    fx2.setTransform(q, 0, 0, q, 0, 0);
    buildVillage();
    composedKey = '';
    composed = null;
    particles = [];
    rain = [];
  }

  // A small pixel villager for players without a character. Same look for the same name.
  const personCache = new Map();
  function personSprite(name) {
    if (personCache.has(name)) return personCache.get(name);
    let h = 0;
    for (const ch of String(name).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const r = rng(h);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const skin = pick(['#f1c9a5', '#d9a77c', '#a8714a', '#7a4b2c', '#f5d7bd']);
    const hair = pick(['#2b1d14', '#5a3a22', '#c8a14a', '#8b3a1e', '#1a1a1a', '#d7d2c8']);
    const shirt = pick(['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d68910', '#16a085', '#7f8c8d', '#c2185b']);
    const pants = pick(['#2c3e50', '#5d4037', '#37474f', '#4e342e']);
    const hat = r() < 0.35;
    const c = document.createElement('canvas');
    c.width = 12;
    c.height = 22;
    const x = c.getContext('2d');
    const R = (px, py, w, hh, col) => {
      x.fillStyle = col;
      x.fillRect(px, py, w, hh);
    };
    const o = '#1b1b22';
    R(3, 2, 6, 6, o);
    R(4, 3, 4, 4, skin);
    R(4, 2, 4, 2, hair);
    R(3, 3, 1, 2, hair);
    R(8, 3, 1, 2, hair);
    R(5, 5, 1, 1, o);
    R(7, 5, 1, 1, o);
    if (hat) {
      R(2, 1, 8, 1, '#2a2a2a');
      R(4, 0, 4, 1, '#2a2a2a');
    }
    R(2, 8, 8, 8, o);
    R(3, 9, 6, 6, shirt);
    R(3, 9, 1, 6, shade(shirt, 0.8));
    R(1, 9, 2, 5, o);
    R(9, 9, 2, 5, o);
    R(1, 13, 1, 1, skin);
    R(10, 13, 1, 1, skin);
    R(3, 16, 6, 5, o);
    R(4, 16, 2, 4, pants);
    R(6, 16, 2, 4, pants);
    R(3, 21, 3, 1, o);
    R(6, 21, 3, 1, o);
    const url = c.toDataURL();
    personCache.set(name, url);
    return url;
  }

  window.PixelScene = {
    enabled: () => enabled,
    get active() {
      return enabled && !!back && !back.classList.contains('hidden');
    },
    get plaza() {
      return plaza;
    },
    // Doors of the houses (in screen pixels), sorted around the plaza: players walk there at night.
    get doors() {
      return houses
        .filter((h) => h.door && h.door.x > 20 && h.door.x < W - 20 && h.door.y > 20 && h.door.y < H - 20)
        .map((h) => ({ ...h.door, a: Math.atan2((h.y - plaza.cy) / plaza.ry, (h.x - plaza.cx) / plaza.rx) }))
        .sort((a, b) => a.a - b.a);
    },
    get exec() {
      return exec;
    },
    personSprite,
    setEnabled(on) {
      enabled = !!on;
    },
    // Where the plaza and the trial stand sit, in screen pixels (worked out from the chat area).
    setPlaza(cx, cy, rx, ry, st) {
      plaza = { cx, cy, rx, ry };
      if (st) stand = st;
      if (back && !back.classList.contains('hidden')) build();
    },
    show(root, newMode, newPhase) {
      if (!back) {
        back = document.createElement('canvas');
        back.className = 'scene-video pixel-scene on';
        front = document.createElement('canvas');
        front.className = 'pixel-front';
        for (const cv of [back, front]) cv.setAttribute('aria-hidden', 'true');
        bx = back.getContext('2d');
        fx2 = front.getContext('2d');
        root.prepend(back);
        root.append(front);
        let timer = 0;
        new ResizeObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(() => !back.classList.contains('hidden') && build(), 80);
        }).observe(root);
      }
      back.classList.remove('hidden');
      front.classList.remove('hidden');
      back.classList.add('on');
      if (newMode !== mode) buildKey = '';
      mode = newMode;
      if (newPhase !== phase && back.dataset.ready) addFx('banner', { dur: 2.6, text: newPhase === 'night' ? '🌙  Night falls' : '☀️  A new day', col: newPhase === 'night' ? '#c7d2fe' : '#fde68a' });
      phase = newPhase;
      back.dataset.ready = '1';
      build();
      start();
    },
    hide() {
      if (!back) return;
      back.classList.add('hidden');
      front.classList.add('hidden');
      back.classList.remove('on');
      stop();
    },
    update(s) {
      if (!s) return;
      game.dead = (s.dead || []).length;
      game.trialOpen = !!s.trial?.open;
    },
    // Game events. Private ones (your own night pick) are only sent by your own screen.
    event(kind, data = {}) {
      if (!back || back.classList.contains('hidden')) return;
      if (kind === 'death') {
        addFx('lightning', { dur: 1.4, x: plaza.cx + (Math.random() - 0.5) * plaza.rx, y: plaza.cy });
        addFx('crows', { dur: 5 });
      } else if (kind === 'guilty' || kind === 'innocent') {
        exec = { name: data.accused, kind, t: performance.now(), dur: kind === 'guilty' ? 4200 : 1800, votes: data.votes || [] };
        if (kind === 'guilty') {
          addFx('banner', { dur: 2.8, text: mode === 'darkknight' ? '⚖️  Guilty — take them away' : '⚖️  Guilty', col: '#fca5a5' });
          setTimeout(() => exec && addFx('lightning', { dur: 1.2, x: stand.x, y: stand.y - stand.h }), 700);
          setTimeout(() => exec && addFx('crows', { dur: 5 }), 900);
        } else {
          addFx('banner', { dur: 2.6, text: '⚖️  Innocent', col: '#86efac' });
          addFx('confetti', { dur: 3.5 });
        }
        window.sceneRelayout?.();
        setTimeout(() => window.sceneRelayout?.(), 650);
      } else if (kind === 'trial') addFx('banner', { dur: 2.6, text: `⚖️  ${data.accused} is on trial`, col: '#fde68a' });
      else if (kind === 'arrest') addFx('police', { dur: 5 });
      else if (kind === 'clue') addFx('note', { dur: 3 });
      else if (kind === 'start') {
        addFx('flash', { dur: 0.8, a: 0.4 });
        addFx('confetti', { dur: 3.5 });
        addFx('banner', { dur: 2.8, text: '🎮  The game begins', col: '#ffffff' });
      } else if (kind === 'my-kill') addFx('paws', { dur: 4 });
      else if (kind === 'my-vigil') addFx('crosshair', { dur: 4 });
      else if (kind === 'my-heal') addFx('shield', { dur: 2 });
      else if (kind === 'my-investigate' || kind === 'my-interrogate') addFx('magnify', { dur: 3 });
      else if (kind === 'my-poison') addFx('poison', { dur: 4 });
    },
  };
})();
