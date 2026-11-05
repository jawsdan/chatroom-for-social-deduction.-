// Background scenes behind the chat: a campfire by day, a sinister house by night.
// Both are built once; switching phase just cross-fades them. The hidden one is paused.
(function () {
  const pine = (x, h, cls) =>
    `<g class="sway ${cls}">
      <rect x="${x - 4}" y="${250 - h * 0.18}" width="8" height="${h * 0.18}" fill="#4a3424"/>
      <path d="M${x} ${250 - h} L${x + h * 0.28} ${250 - h * 0.55} L${x + h * 0.16} ${250 - h * 0.55} L${x + h * 0.36} ${250 - h * 0.18} L${x - h * 0.36} ${250 - h * 0.18} L${x - h * 0.16} ${250 - h * 0.55} L${x - h * 0.28} ${250 - h * 0.55}Z" fill="#3f6b2a"/>
    </g>`;

  const DAY = `
<svg class="scene-svg" viewBox="0 0 600 260" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sceneFireGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffb347" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffb347" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="300" cy="250" rx="300" ry="26" fill="#7a9a45" opacity="0.45"/>
  ${pine(40, 150, 's1')}${pine(95, 110, 's2')}${pine(510, 130, 's2')}${pine(565, 165, 's1')}
  <circle class="fire-glow" cx="300" cy="200" r="130" fill="url(#sceneFireGlow)"/>
  <rect x="150" y="222" width="80" height="18" rx="9" fill="#7c4a2a"/><circle cx="150" cy="231" r="9" fill="#a26a3c"/>
  <rect x="370" y="222" width="80" height="18" rx="9" fill="#7c4a2a"/><circle cx="450" cy="231" r="9" fill="#a26a3c"/>
  <g fill="#8b8f98">
    <ellipse cx="262" cy="240" rx="11" ry="7"/><ellipse cx="285" cy="244" rx="12" ry="7"/><ellipse cx="312" cy="244" rx="12" ry="7"/><ellipse cx="338" cy="240" rx="11" ry="7"/>
  </g>
  <g fill="#6b3f22">
    <rect x="258" y="222" width="86" height="14" rx="7" transform="rotate(14 300 229)"/>
    <rect x="258" y="222" width="86" height="14" rx="7" transform="rotate(-14 300 229)"/>
  </g>
  <path class="flame f1" d="M300 118 C334 160 350 190 334 214 C322 230 278 230 266 214 C250 190 268 160 300 118Z" fill="#f97316"/>
  <path class="flame f2" d="M300 146 C322 174 334 196 322 214 C314 224 286 224 278 214 C266 196 280 174 300 146Z" fill="#fbbf24"/>
  <path class="flame f3" d="M300 174 C312 190 318 204 311 215 C306 221 294 221 289 215 C282 204 288 190 300 174Z" fill="#fef3c7"/>
  <g fill="#fcd34d">
    <circle class="spark k1" cx="292" cy="150" r="2.5"/><circle class="spark k2" cx="306" cy="146" r="2"/>
    <circle class="spark k3" cx="298" cy="156" r="2.2"/><circle class="spark k4" cx="312" cy="152" r="1.8"/>
    <circle class="spark k5" cx="288" cy="160" r="2"/><circle class="spark k6" cx="304" cy="158" r="2.4"/>
  </g>
</svg>
<div class="leaf l1"></div><div class="leaf l2"></div><div class="leaf l3"></div><div class="leaf l4"></div>`;

  const NIGHT = `
<svg class="scene-svg" viewBox="0 0 600 280" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sceneHaze" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8b7fc7" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="#5b4f8f" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#5b4f8f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse class="haze" cx="385" cy="130" rx="190" ry="140" fill="url(#sceneHaze)"/>
  <path d="M0 280 Q160 196 320 206 Q470 214 600 250 L600 280Z" fill="#090a14"/>
  <g class="sway s3" stroke="#090a14" stroke-linecap="round" fill="none">
    <path d="M110 236 C108 200 114 170 106 140" stroke-width="11"/>
    <path d="M108 176 C92 164 82 150 70 146" stroke-width="5"/>
    <path d="M110 158 C126 146 136 128 150 120" stroke-width="5"/>
    <path d="M106 140 C100 122 104 108 96 96" stroke-width="4"/>
    <path d="M78 150 C70 140 64 142 56 134" stroke-width="3"/>
    <path d="M142 124 C150 112 160 112 166 102" stroke-width="3"/>
    <path d="M98 100 C90 92 92 84 84 78" stroke-width="2"/>
  </g>
  <g fill="#0d0f1d">
    <path d="M168 238 v-16 a10 10 0 0 1 20 0 v16Z"/><path d="M200 236 v-12 a8 8 0 0 1 16 0 v12Z" transform="rotate(-8 208 230)"/>
    <rect x="232" y="214" width="5" height="22" transform="rotate(6 234 225)"/><rect x="225" y="220" width="18" height="5" transform="rotate(6 234 222)"/>
  </g>
  <g fill="#06070e">
    <path d="M330 210 L330 132 L382 98 L436 132 L436 210Z" transform="rotate(-2 383 160)"/>
    <path d="M318 136 L382 86 L450 136Z" transform="rotate(-2 383 110)"/>
    <path d="M404 136 L404 70 L414 52 L424 70 L424 136Z"/>
    <path d="M396 72 L414 28 L432 72Z"/>
    <rect x="346" y="104" width="10" height="26"/>
  </g>
  <g>
    <rect class="win w1" x="346" y="150" width="18" height="22" fill="#f59e0b"/>
    <rect class="win w2" x="398" y="150" width="18" height="22" fill="#f59e0b"/>
    <circle class="win w3" cx="414" cy="84" r="5" fill="#dc2626"/>
    <path d="M355 150 v22 M346 161 h18 M407 150 v22 M398 161 h18" stroke="#06070e" stroke-width="2"/>
    <rect x="372" y="178" width="20" height="32" fill="#020308"/>
  </g>
  <g stroke="#090a14" stroke-width="4" stroke-linecap="round">
    <path d="M460 236 l2 -22 M478 238 l-1 -20 M496 240 l3 -21 M514 242 l-2 -18 M532 244 l2 -20 M548 246 l-3 -17"/>
    <path d="M456 226 L552 236" stroke-width="3"/>
  </g>
</svg>
<div class="fog fg1"></div><div class="fog fg2"></div>
<div class="bat b1"><svg viewBox="0 0 40 16"><path d="M20 6 C16 0 10 2 0 4 C6 6 8 10 10 14 C13 10 17 10 20 12 C23 10 27 10 30 14 C32 10 34 6 40 4 C30 2 24 0 20 6Z" fill="#06070e"/></svg></div>
<div class="bat b2"><svg viewBox="0 0 40 16"><path d="M20 6 C16 0 10 2 0 4 C6 6 8 10 10 14 C13 10 17 10 20 12 C23 10 27 10 30 14 C32 10 34 6 40 4 C30 2 24 0 20 6Z" fill="#06070e"/></svg></div>
<div class="leaf dead l1"></div><div class="leaf dead l2"></div><div class="leaf dead l3"></div>`;

  let built = false;
  window.setScene = function (phase) {
    const root = document.getElementById('scene');
    if (!root) return;
    if (!built) {
      root.innerHTML = `<div class="scene-layer day">${DAY}</div><div class="scene-layer night">${NIGHT}</div>`;
      built = true;
    }
    root.querySelector('.scene-layer.day').classList.toggle('on', phase !== 'night');
    root.querySelector('.scene-layer.night').classList.toggle('on', phase === 'night');
  };
})();
