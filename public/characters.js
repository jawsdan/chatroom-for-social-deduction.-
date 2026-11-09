// Characters players can pick on the character select screen.
// To add one: put an animated .webp (transparent background) and a still .png in img/characters,
// add an entry here, add its id to CHARACTERS in server.js, and give it a free spot by the fire.
// Spots are in the background videos' own pixels (864x576): x = where the feet are, y = ground line.
window.CHARACTERS = [
  {
    id: 'firekeeper',
    name: 'The Firekeeper',
    desc: 'Wild hair, wide eyes. Has seen things by this fire.',
    img: 'img/characters/firekeeper.webp',
    still: 'img/characters/firekeeper-still.png',
    height: 138,
    spot: { day: { x: 250, y: 452 }, night: { x: 236, y: 478 } },
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
    flip: true,
  },
];
