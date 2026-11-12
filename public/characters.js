// Characters players can pick on the character select screen.
// To add one: put an animated .webp (transparent background) and a still .png in img/characters,
// add an entry here, add its id to CHARACTERS in server.js, and give it a free spot by the fire.
// Spots are in the background videos' own pixels (864x576): x = where the feet are, y = ground line.
// spotHd / heightHd are the same for the big-screen videos (1280x720).
// hang (optional): a picture shown instead while the character hangs after a guilty verdict.
window.CHARACTERS = [
  {
    id: 'firekeeper',
    name: 'The Firekeeper',
    desc: 'Wild hair, wide eyes. Has seen things by this fire.',
    img: 'img/characters/firekeeper.webp',
    still: 'img/characters/firekeeper-still.png',
    hang: 'img/characters/firekeeper-hang.webp',
    height: 138,
    spot: { day: { x: 250, y: 452 }, night: { x: 236, y: 478 } },
    spotHd: { day: { x: 405, y: 585 }, night: { x: 290, y: 640 } },
    heightHd: 150,
    // The Dark Knight: on the rooftop by day, at the Amusement Mile gate by night (1280x720).
    spotDk: { day: { x: 330, y: 690 }, night: { x: 330, y: 650 } },
    heightDk: 170,
  },
  {
    id: 'snout',
    name: 'Sleepy Snout',
    desc: 'Always half asleep. Somehow hears everything.',
    img: 'img/characters/snout.webp',
    still: 'img/characters/snout-still.png',
    height: 138,
    // Right of the fire, mirrored so he faces it.
    spot: { day: { x: 625, y: 452 }, night: { x: 640, y: 482 } },
    spotHd: { day: { x: 880, y: 585 }, night: { x: 735, y: 640 } },
    heightHd: 150,
    spotDk: { day: { x: 1150, y: 700 }, night: { x: 780, y: 650 } },
    heightDk: 170,
    flip: true,
  },
  {
    id: 'joker',
    name: 'The Joker',
    desc: 'Why so serious? Shows up with a card up his sleeve.',
    img: 'img/characters/joker.webp?v=2',
    still: 'img/characters/joker-still.png?v=2',
    height: 150,
    spot: { day: { x: 345, y: 520 }, night: { x: 350, y: 530 } },
    spotHd: { day: { x: 190, y: 600 }, night: { x: 150, y: 655 } },
    heightHd: 165,
    // The Dark Knight: on the rooftop by day, at the front of Amusement Mile by night.
    spotDk: { day: { x: 760, y: 705 }, night: { x: 575, y: 695 } },
    heightDk: 185,
  },
  {
    id: 'boo',
    name: 'Little Boo',
    desc: 'A small sheet ghost with big, worried eyes.',
    img: 'img/characters/boo.webp',
    still: 'img/characters/boo-still.png',
    height: 78,
    // Ghosts float a little above the ground.
    spot: { day: { x: 545, y: 400 }, night: { x: 550, y: 410 } },
    spotHd: { day: { x: 1090, y: 610 }, night: { x: 1100, y: 640 } },
    heightHd: 88,
    spotDk: { day: { x: 665, y: 470 }, night: { x: 680, y: 560 } },
    heightDk: 100,
  },
  {
    id: 'grinny',
    name: 'Grinny',
    desc: 'A ghost with a jagged grin. Up to no good.',
    img: 'img/characters/grinny.webp',
    still: 'img/characters/grinny-still.png',
    height: 72,
    // Floats over the fire's smoke.
    spot: { day: { x: 450, y: 330 }, night: { x: 455, y: 345 } },
    spotHd: { day: { x: 640, y: 430 }, night: { x: 640, y: 450 } },
    heightHd: 82,
    spotDk: { day: { x: 560, y: 570 }, night: { x: 455, y: 560 } },
    heightDk: 95,
  },
  {
    id: 'gunslinger',
    name: 'The Gunslinger',
    desc: 'A quiet smile and two revolvers. Never says where he rode in from.',
    img: 'img/characters/gunslinger.webp',
    still: 'img/characters/gunslinger-still.png',
    height: 140,
    // Front right of the fire, across from the Joker.
    spot: { day: { x: 565, y: 525 }, night: { x: 560, y: 535 } },
    spotHd: { day: { x: 790, y: 520 }, night: { x: 860, y: 655 } },
    heightHd: 155,
    // The Dark Knight: on the near rooftop by day, by the clown booth at Amusement Mile by night.
    spotDk: { day: { x: 585, y: 705 }, night: { x: 985, y: 665 } },
    heightDk: 175,
  },
{
    id: 'daisy',
    name: 'Daisy',
    desc: 'Always smiling, always holding a flower. Hard to suspect.',
    img: 'img/characters/daisy.webp',
    still: 'img/characters/daisy-still.png',
    height: 120,
    // On the grass behind the fire, a little to the left.
    spot: { day: { x: 300, y: 362 }, night: { x: 300, y: 392 } },
    spotHd: { day: { x: 520, y: 395 }, night: { x: 470, y: 560 } },
    heightHd: 135,
    // The Dark Knight: on the rooftop to the right by day, by the fence at Amusement Mile by night.
    spotDk: { day: { x: 800, y: 625 }, night: { x: 850, y: 655 } },
    heightDk: 150,
  },
{
    id: 'watcher',
    name: 'The Fox',
    desc: 'Cap low, mask up. Already knows your secrets.',
    img: 'img/characters/watcher.webp',
    still: 'img/characters/watcher-still.png',
    // His own picture while he hangs from the gallows after a guilty verdict (live pixel village).
    hang: 'img/characters/watcher-hang.webp',
    height: 140,
    // Front and center, in front of the fire.
    spot: { day: { x: 455, y: 505 }, night: { x: 455, y: 512 } },
    spotHd: { day: { x: 640, y: 640 }, night: { x: 600, y: 655 } },
    heightHd: 150,
    // The Dark Knight: on the near rooftop by day, at the front of Amusement Mile by night.
    spotDk: { day: { x: 455, y: 700 }, night: { x: 680, y: 695 } },
    heightDk: 175,
  },
];

// ---------- Villagers ----------
// The small pixel villagers. They can be picked on the character select screen like the characters
// above, and "Random" (no pick) gives you one of them. They live in the pixel village only:
// in video mode they don't stand by the fire (they have no spots there).
window.drawVillager = function (look, scale = 8) {
  const c = document.createElement('canvas');
  c.width = 12 * scale;
  c.height = 22 * scale;
  const x = c.getContext('2d');
  const shade = (hex, f) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
  const R = (px, py, w, h, col) => {
    x.fillStyle = col;
    x.fillRect(px * scale, py * scale, w * scale, h * scale);
  };
  const { skin, hair, shirt, pants, hat } = look;
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
  return c.toDataURL();
};
window.VILLAGERS = [
  { id: 'v-baker', name: 'Bram the Baker', desc: 'Up before the sun. Smells of fresh bread.', look: { skin: '#f1c9a5', hair: '#d7d2c8', shirt: '#d68910', pants: '#5d4037' } },
  { id: 'v-farmer', name: 'Fen the Farmer', desc: 'Knows every field and every rumor.', look: { skin: '#d9a77c', hair: '#5a3a22', shirt: '#27ae60', pants: '#2c3e50', hat: true } },
  { id: 'v-smith', name: 'Hilda the Smith', desc: 'Strong arms, short temper.', look: { skin: '#a8714a', hair: '#1a1a1a', shirt: '#c0392b', pants: '#37474f' } },
  { id: 'v-fisher', name: 'Ola the Fisher', desc: 'Patient. Always waiting for a bite.', look: { skin: '#f5d7bd', hair: '#c8a14a', shirt: '#2e86c1', pants: '#4e342e', hat: true } },
  { id: 'v-weaver', name: 'Mira the Weaver', desc: 'Weaves cloth, and stories.', look: { skin: '#7a4b2c', hair: '#2b1d14', shirt: '#8e44ad', pants: '#2c3e50' } },
  { id: 'v-miller', name: 'Otto the Miller', desc: 'Quiet, dusty, sees everyone pass by.', look: { skin: '#f1c9a5', hair: '#8b3a1e', shirt: '#7f8c8d', pants: '#5d4037', hat: true } },
  { id: 'v-herbalist', name: 'Liv the Herbalist', desc: 'Has a cure for everything. Almost.', look: { skin: '#d9a77c', hair: '#c8a14a', shirt: '#16a085', pants: '#37474f' } },
  { id: 'v-tailor', name: 'Tove the Tailor', desc: 'Notices every loose thread.', look: { skin: '#f5d7bd', hair: '#2b1d14', shirt: '#c2185b', pants: '#4e342e' } },
];
for (const v of window.VILLAGERS) {
  v.villager = true;
  v.img = v.still = window.drawVillager(v.look);
  window.CHARACTERS.push(v);
}
