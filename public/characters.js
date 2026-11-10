// Characters players can pick on the character select screen.
// To add one: put an animated .webp (transparent background) and a still .png in img/characters,
// add an entry here, add its id to CHARACTERS in server.js, and give it a free spot by the fire.
// Spots are in the background videos' own pixels (864x576): x = where the feet are, y = ground line.
// spotHd / heightHd are the same for the big-screen videos (1280x720).
window.CHARACTERS = [
  {
    id: 'firekeeper',
    name: 'The Firekeeper',
    desc: 'Wild hair, wide eyes. Has seen things by this fire.',
    img: 'img/characters/firekeeper.webp',
    still: 'img/characters/firekeeper-still.png',
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
];
