// Inline SVG pictures used for phase and role pop-ups.
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

  civilian: `
<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-label="Civilian">
  <rect x="0" y="0" width="200" height="220" rx="18" fill="#e8f3e3"/>
  <path d="M20 220 Q100 120 180 220Z" fill="#6a994e"/>
  <path d="M55 220 C55 165 145 165 145 220Z" fill="#a7c957"/>
  <circle cx="100" cy="105" r="38" fill="#f2c9a0"/>
  <path d="M55 88 Q100 40 145 88 L155 92 Q100 78 45 92Z" fill="#bc8a5f"/>
  <ellipse cx="100" cy="74" rx="34" ry="18" fill="#dda15e"/>
  <circle cx="86" cy="104" r="4" fill="#3d2b1f"/><circle cx="114" cy="104" r="4" fill="#3d2b1f"/>
  <path d="M86 120 Q100 132 114 120" stroke="#3d2b1f" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="150" y="110" width="8" height="90" rx="3" fill="#7f5539"/>
  <path d="M140 105 L168 105 L162 118 L146 118Z" fill="#adb5bd"/>
</svg>`,

  werewolf: `
<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-label="Werewolf">
  <rect x="0" y="0" width="200" height="220" rx="18" fill="#1b1f3b"/>
  <circle cx="150" cy="50" r="28" fill="#f1f0d8"/>
  <path d="M40 205 L55 120 L35 60 L75 95 L100 85 L125 95 L165 60 L145 120 L160 205Z" fill="#4a4e69"/>
  <path d="M70 140 L100 190 L130 140 L115 128 L100 132 L85 128Z" fill="#9a8c98"/>
  <path d="M75 115 L92 122 L78 126Z" fill="#ffd60a"/><path d="M125 115 L108 122 L122 126Z" fill="#ffd60a"/>
  <path d="M90 168 L95 178 L100 168 L105 178 L110 168" stroke="#fff" stroke-width="3" fill="none"/>
  <path d="M98 148 L102 148 L100 154Z" fill="#22223b"/>
  <path d="M40 60 L52 72 M160 60 L148 72" stroke="#22223b" stroke-width="4"/>
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
