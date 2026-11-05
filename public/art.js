// Pictures used for phase, trial and role pop-ups.
window.ART = {
  day: `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Day">
  <g stroke="#ffb703" stroke-width="10" stroke-linecap="round">
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      const x1 = 100 + Math.cos(a) * 62, y1 = 100 + Math.sin(a) * 62;
      const x2 = 100 + Math.cos(a) * 88, y2 = 100 + Math.sin(a) * 88;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }).join('')}
  </g>
  <circle cx="100" cy="100" r="50" fill="#ffc93c" stroke="#ff9f1c" stroke-width="5"/>
  <circle cx="86" cy="86" r="16" fill="#ffe28a"/>
</svg>`,

  night: `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Night">
  <g fill="#fff8c4">
    <circle cx="40" cy="40" r="3"/><circle cx="165" cy="150" r="3.5"/><circle cx="160" cy="35" r="2.5"/>
    <circle cx="30" cy="150" r="2.5"/><circle cx="175" cy="95" r="2"/>
    <path d="M150 60 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z"/>
  </g>
  <path d="M118 36 A70 70 0 1 0 168 140 A56 56 0 1 1 118 36 Z" fill="#f4f1dc" stroke="#d9d6bf" stroke-width="3"/>
  <circle cx="72" cy="115" r="8" fill="#d9d6bf"/><circle cx="92" cy="150" r="5" fill="#d9d6bf"/><circle cx="60" cy="85" r="4" fill="#d9d6bf"/>
</svg>`,

  scales: `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Trial">
  <g stroke="#e9c46a" stroke-width="7" stroke-linecap="round" fill="none">
    <line x1="100" y1="30" x2="100" y2="170"/><line x1="40" y1="55" x2="160" y2="55"/>
    <line x1="40" y1="55" x2="22" y2="110"/><line x1="40" y1="55" x2="58" y2="110"/>
    <line x1="160" y1="55" x2="142" y2="110"/><line x1="160" y1="55" x2="178" y2="110"/>
    <line x1="65" y1="170" x2="135" y2="170"/>
  </g>
  <path d="M15 110 Q40 140 65 110Z M135 110 Q160 140 185 110Z" fill="#e9c46a"/>
  <circle cx="100" cy="28" r="9" fill="#e9c46a"/>
</svg>`,
};
for (const k in window.ART) window.ART[k] = window.ART[k].trim();

// Role pictures (round badges in public/img/roles).
window.ROLE_IMG = {};
for (const r of ['civilian', 'werewolf', 'serialkiller', 'doctor', 'officer']) {
  window.ROLE_IMG[r] = `img/roles/${r}.webp`;
  window.ART[r] = `<img class="role-img" src="img/roles/${r}.webp" alt="" draggable="false">`;
  new Image().src = window.ROLE_IMG[r]; // preload so pop-ups show instantly
}
