// Background videos behind the chat: a campfire by day, a haunted house by night.
// Both load once; switching phase cross-fades them, and the hidden one is paused.
(function () {
  let videos = null;
  function build(root) {
    videos = {};
    for (const phase of ['day', 'night']) {
      const v = document.createElement('video');
      v.className = 'scene-video';
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.poster = `video/${phase}-poster.jpg`;
      for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
        const src = document.createElement('source');
        src.src = `video/${phase}.${ext}`;
        src.type = type;
        v.append(src);
      }
      root.append(v);
      videos[phase] = v;
    }
  }
  window.setScene = function (phase) {
    const root = document.getElementById('scene');
    if (!root) return;
    if (!videos) build(root);
    const active = phase === 'night' ? 'night' : 'day';
    for (const [name, v] of Object.entries(videos)) {
      const on = name === active;
      v.classList.toggle('on', on);
      if (on) v.play().catch(() => {});
      else setTimeout(() => !v.classList.contains('on') && v.pause(), 1000); // pause after the fade
    }
  };
  // Browsers pause background videos in hidden tabs; resume when the tab comes back.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && videos) for (const v of Object.values(videos)) if (v.classList.contains('on')) v.play().catch(() => {});
  });
})();
