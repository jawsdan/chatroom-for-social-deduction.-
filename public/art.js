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

  serialkiller: `
<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-label="Serial Killer">
  <rect x="0" y="0" width="200" height="220" rx="18" fill="#2b0f16"/>
  <circle cx="100" cy="95" r="70" fill="#4a1622"/>
  <path d="M40 220 C40 150 160 150 160 220Z" fill="#111"/>
  <path d="M58 110 C58 55 142 55 142 110 L142 150 L58 150Z" fill="#1a1a1a"/>
  <ellipse cx="100" cy="112" rx="30" ry="36" fill="#f1ece4"/>
  <path d="M82 104 L96 108 L84 114Z" fill="#111"/><path d="M118 104 L104 108 L116 114Z" fill="#111"/>
  <path d="M90 130 Q100 124 110 130" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/>
  <g transform="translate(18 40) rotate(20 150 140)">
    <rect x="144" y="120" width="12" height="34" rx="3" fill="#6b3e26"/>
    <path d="M141 120 L159 120 L156 70 Q150 58 144 70Z" fill="#d9dde3" stroke="#9aa1ab" stroke-width="2"/>
  </g>
  <path d="M30 40 l6 14 M170 30 l-6 14" stroke="#e5484d" stroke-width="4" stroke-linecap="round"/>
</svg>`,

  doctor: `
<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-label="Doctor">
  <rect x="0" y="0" width="200" height="220" rx="18" fill="#e3f4f7"/>
  <path d="M35 220 C35 150 165 150 165 220Z" fill="#ffffff" stroke="#cfe3e8" stroke-width="3"/>
  <path d="M85 160 L100 200 L115 160Z" fill="#0ea5e9"/>
  <path d="M70 165 C65 185 80 200 95 195" stroke="#334155" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="96" cy="195" r="7" fill="#94a3b8"/>
  <circle cx="100" cy="100" r="38" fill="#f2c9a0"/>
  <path d="M62 92 Q100 50 138 92 Q120 72 100 74 Q80 72 62 92Z" fill="#5b3a29"/>
  <circle cx="86" cy="102" r="4" fill="#3d2b1f"/><circle cx="114" cy="102" r="4" fill="#3d2b1f"/>
  <path d="M88 118 Q100 128 112 118" stroke="#3d2b1f" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="140" y="28" width="40" height="40" rx="10" fill="#e5484d"/>
  <path d="M160 36 V60 M148 48 H172" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
</svg>`,

  officer: `
<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-label="Officer">
  <rect x="0" y="0" width="200" height="220" rx="18" fill="#e6ecf8"/>
  <path d="M35 220 C35 150 165 150 165 220Z" fill="#1e3a8a"/>
  <path d="M120 170 l8 4 l8 -4 l-2 10 l-6 6 l-6 -6Z" fill="#facc15"/>
  <circle cx="100" cy="108" r="36" fill="#e0b48c"/>
  <circle cx="87" cy="110" r="4" fill="#2a1d14"/><circle cx="113" cy="110" r="4" fill="#2a1d14"/>
  <path d="M88 126 H112" stroke="#2a1d14" stroke-width="4" stroke-linecap="round"/>
  <path d="M58 86 Q100 40 142 86Z" fill="#1e3a8a"/>
  <rect x="56" y="82" width="88" height="12" rx="4" fill="#0f1f4d"/>
  <path d="M100 56 l5 8 l9 1 l-7 6 l2 9 l-9 -5 l-9 5 l2 -9 l-7 -6 l9 -1Z" fill="#facc15"/>
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
