/* global io, ART */
const socket = io();
const $ = (id) => document.getElementById(id);
const key = (n) => String(n).toLowerCase();

let me = null; // my name
let state = null; // latest public state from server
let channel = 'lobby'; // 'lobby' | 'mod' | 'wolf'
let lobbyMsgs = [];
let wolfMsgs = null; // wolf den messages, or null when I have no access
let myThread = []; // my private chat with the moderator
let aiMsgs = []; // my private chat with the AI helper
let aiMode = false; // Talk to moderator: when on, messages go to the AI helper instead
// Players see the AI helper inside their Talk to moderator chat.
const inAiChat = () => channel === 'mod' && state && !amMod();
let modThreads = {}; // moderator only: key -> []
let aiThreads = {}; // moderator only: key -> each player's AI helper chat
let selectedThread = null; // moderator only: key of member being viewed
const unreadThreads = new Set();
let modUnread = 0;
let lobbyUnread = 0;
let wolfUnread = 0;
let currentPhase = 'day';
let trialPopupShownFor = null;
let lastRendered = null; // { from, ts } of the last message drawn, for grouping

const ROLE = {
  civilian: { label: 'Civilian', icon: '🧑‍🌾', color: 'var(--success)', desc: 'Find the killers before it is too late.' },
  werewolf: { label: 'Werewolf', icon: '🐺', color: 'var(--danger)', desc: 'Hunt at night with your pack. Plan in the wolf den, then tell the moderator your target.' },
  serialkiller: { label: 'Serial Killer', icon: '🔪', color: 'var(--danger)', desc: 'You work alone. Each night, tell the moderator who you want to eliminate. Do not get caught.' },
  doctor: { label: 'Doctor', icon: '🩺', color: '#0ea5e9', desc: 'Each night, tell the moderator one player to protect.' },
  officer: { label: 'Officer', icon: '🚔', color: '#1d4ed8', desc: 'Each day you may arrest one player. They cannot vote that day and cannot use their ability the night after.' },
  detective: { label: 'Detective', icon: '👮', color: '#3b82f6', desc: 'Each night, ask the moderator to investigate one player.' },
  mother: { label: 'Mother', icon: '👩', color: '#b83b7a', desc: 'You are part of the family, on the village side. If your Son dies, grief turns you into the Joker and you join the wolves.' },
  father: { label: 'Father', icon: '👨', color: '#2f5ea8', desc: 'You are part of the family, on the village side. If your Son dies, you become the Vigilante.' },
  son: { label: 'Son', icon: '👦', color: '#4d7c0f', desc: 'You are part of the family, on the village side. If both your parents die, you become Batman.' },
  joker: { label: 'Joker', icon: '🃏', color: '#7e22ce', desc: 'Your Son is gone. You now hunt with the wolves: join the wolf den and pick a victim with the pack at night.' },
  vigilante: { label: 'Vigilante', icon: '🎯', color: '#c2410c', desc: 'You are still on the village side, but each night you may kill one player. You can also choose to kill nobody.' },
  batman: { label: 'Batman', icon: '🦇', color: '#eab308', desc: 'Your parents are gone. Every morning you get a clue: someone who used an ability, or someone an ability was used on.' },
  // Game mode "The Dark Knight": the villains.
  dkjoker: { label: 'The Joker', icon: '🃏', color: '#7e22ce', desc: "Why so serious? Gotham is your playground, and every night you decide who gets the punchline. Pick a victim with Kill (or let them sweat one more night). Scheme with your crew at Amusement Mile, and never let Gotham see who is behind the smile." },
  harley: { label: 'Harley Quinn', icon: '🔨', color: '#e11d48', desc: "You are head over heels for Mistah J and would do anything for him. You have no ability, but you are his best trick: charm, lie and fool the citizens of Gotham so your Puddin' gets away with his plans. If The Joker wins, you win." },
  ivy: { label: 'Poison Ivy', icon: '🌿', color: '#15803d', desc: 'Gotham poisoned the green world, and now you return the favor. Each night, pick one player to Poison. Your toxins cloud their mind: Thomas Wayne cannot protect anyone that night, and The Batman walks away with false intel.' },
  clayface: { label: 'Clayface', icon: '🎭', color: '#a16207', desc: 'Once an actor, now living clay: you can wear any face in Gotham. Choose your Disguise (any role except The Batman). When The Batman investigates you, your greatest performance fools him and he sees that role instead.' },
};
// The Dark Knight renames the village roles and gives them new pictures.
const DK_SKIN = {
  civilian: { label: 'Citizen', img: 'citizen', desc: 'You are an ordinary citizen of Gotham, and your city is rotting from the inside. Keep your eyes open, trust no smile, and vote the villains into Arkham before The Joker comes knocking on your door.' },
  doctor: { label: 'Thomas Wayne', img: 'thomaswayne', desc: "You are Gotham's finest surgeon, and you refuse to let this city die. Each night, choose one player to Protect from The Joker. Beware Poison Ivy: her toxin leaves you too dizzy to save anyone that night." },
  detective: { label: 'The Batman', img: 'dkbatman', desc: "You are vengeance. You are the night. Each night, Investigate one player and learn who they really are. But trust nothing blindly: Clayface wears other faces, and Poison Ivy's toxin fills your head with false intel." },
  officer: { label: 'Commissioner Gordon', img: 'gordon', desc: "You are Gotham's last honest cop. Work with The Batman to expose The Joker and his crew. Each day you may Arrest one player: they cannot vote that day and cannot use their ability the night after." },
};
const DK_VILLAINS = ['dkjoker', 'harley', 'ivy', 'clayface'];
const ROLE_BASE = Object.fromEntries(Object.keys(DK_SKIN).map((k) => [k, { role: { ...ROLE[k] }, img: ROLE_IMG[k], art: ART[k] }]));
let skinMode = 'classic';
const dkMode = () => skinMode === 'darkknight';
// Switch labels, pictures and the look when the moderator changes the game mode.
function applyGameMode(mode) {
  mode = mode === 'darkknight' ? 'darkknight' : 'classic';
  if (mode === skinMode) return;
  skinMode = mode;
  for (const [k, skin] of Object.entries(DK_SKIN)) {
    const base = ROLE_BASE[k];
    ROLE[k] = dkMode() ? { ...base.role, label: skin.label, desc: skin.desc } : { ...base.role };
    ROLE_IMG[k] = dkMode() ? ROLE_IMG[skin.img] : base.img;
    ART[k] = dkMode() ? ART[skin.img] : base.art;
  }
  document.body.classList.toggle('mode-dk', dkMode());
  // Redraw everything that remembers what it last showed.
  document.querySelectorAll('[data-sig]').forEach((e) => (e.dataset.sig = ''));
  fxRole = undefined;
}

$('joinLogo').innerHTML = ART.night;
// On phones and tablets, don't pop the keyboard up by itself.
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
function focusComposer() {
  if (!IS_TOUCH && !$('msgInput').disabled) $('msgInput').focus();
}
if (!IS_TOUCH) $('nameInput').focus();
$('brandLogo').innerHTML = ART.night;

// ---------- Helpers ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(cls, text, onClick) {
  const b = el('button', 'btn ' + cls, text);
  b.type = 'button';
  if (onClick) b.onclick = onClick;
  return b;
}
const COLORS = ['#5b5bf0', '#e5484d', '#16a37b', '#f08c3a', '#8b5cf6', '#0ea5e9', '#d946ef', '#14b8a6', '#c2410c', '#4f46e5'];
// The role I'm allowed to know for a player: everyone's if I'm the moderator, my own, and my fellow wolves'.
function knownRole(name) {
  if (!state || !name) return null;
  const k = key(name);
  if (state.modView) return state.modView.roles[k] || null;
  if (k === key(me)) return state.me.role || null;
  if (state.me.wolfmates?.some((n) => key(n) === k)) return state.me.packRoles?.[k] || 'werewolf';
  return null;
}
// Small round role picture to use next to text.
function roleIcon(role) {
  const img = el('img', 'ri');
  img.src = (ROLE_IMG[role] || `img/roles/${role}.webp?v=${window.ROLE_IMG_VERSION}`).replace('/roles/', '/roles/sm/');
  img.alt = '';
  return img;
}
// A label with the role picture in front, e.g. [pic] Doctor.
function roleLabel(cls, role, text) {
  const s = el('span', cls);
  s.append(roleIcon(role), document.createTextNode(' ' + text));
  return s;
}
function avatar(name, extra = '') {
  const role = knownRole(name);
  if (role && ROLE_IMG[role]) {
    const a = el('div', 'avatar has-role ' + extra);
    const img = el('img');
    img.src = ROLE_IMG[role].replace('/roles/', '/roles/sm/');
    img.alt = '';
    img.draggable = false;
    a.title = `${name}: ${ROLE[role].label}`;
    a.append(img);
    return a;
  }
  let h = 0;
  for (const ch of key(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = el('div', 'avatar ' + extra);
  a.style.background = COLORS[h % COLORS.length];
  const parts = String(name).trim().split(/\s+/);
  a.textContent = ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
  return a;
}
function toast(text) {
  const t = el('div', 'toast', text);
  $('toasts').append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}
const amMod = () => !!state?.me?.moderator;
const amMuted = () => !!state?.me?.muted;
function displayName(k) {
  const u = state?.users.find((x) => key(x.name) === k);
  return u ? u.name : k;
}
function timeOf(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
// A locked pop-up can't be closed by clicking outside it or pressing Escape (used for the trial vote).
let modalLocked = false;
function openModal(build, locked = false) {
  modalLocked = locked;
  const card = $('modalCard');
  card.className = 'modal-card';
  card.innerHTML = '';
  build(card);
  $('modal').classList.remove('hidden');
  // Restart the pop-in animation each time.
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
}
function closeModal() {
  modalLocked = false;
  $('modal').classList.add('hidden');
  // Show the next revealed clue, if any are waiting.
  setTimeout(showNextClue, 250);
}
$('modal').addEventListener('click', (e) => e.target === $('modal') && !modalLocked && closeModal());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modalLocked) closeModal();
    closeDrawers();
  }
});

// ---------- Drawers (small screens) ----------
function closeDrawers() {
  $('sideLeft').classList.remove('open');
  $('sideRight').classList.remove('open');
  $('scrim').classList.remove('on');
}
$('leftBtn').onclick = () => {
  $('sideLeft').classList.add('open');
  $('scrim').classList.add('on');
};
$('rightBtn').onclick = () => {
  $('sideRight').classList.add('open');
  $('scrim').classList.add('on');
};
$('scrim').onclick = closeDrawers;

// ---------- Join ----------
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('nameInput').value.trim();
  if (!name) return ($('joinError').textContent = 'Please enter a name.');
  // Say so when the server can't be reached, instead of the button doing nothing.
  if (!socket.connected) {
    $('joinError').textContent = 'Connecting to the game… try again in a moment. If it keeps saying this, refresh the page.';
    socket.connect();
    return;
  }
  $('joinError').textContent = '';
  socket.timeout(8000).emit('join', name, (err, res) => {
    if (err) return ($('joinError').textContent = 'The game did not answer. Check your connection and refresh the page.');
    if (!res.ok) return ($('joinError').textContent = res.error);
    me = res.name;
    $('join').classList.add('hidden');
    $('app').classList.remove('hidden');
    // Pick a character before playing.
    openCharSelect();
  });
});

socket.on('disconnect', () => me && toast('Connection lost. Reconnecting…'));
socket.on('connect', () => {
  // After a reconnect the server forgot us; rejoin with the same name.
  if (me) socket.emit('join', me, (res) => !res.ok && toast('Could not rejoin: ' + res.error + ' Refresh the page.'));
});

// ---------- Server events ----------
socket.on('state', (s) => {
  state = s;
  // The server's clock decides when the phase started, so everyone's timer matches.
  clockOffset = s.serverNow - Date.now();
  tickPhaseTimer();
  applyGameMode(s.mode);
  if (channel === 'wolf' && !s.me.wolfAccess) channel = 'lobby';
  renderAll(false);
  // Players who picked a character stand by the fire.
  window.setFireCharacters?.(
    s.users.map((u) => ({ name: u.name, character: u.character, dead: u.muted || s.dead?.includes(key(u.name)) })),
    s.phase
  );
  if (!$('charSelect').classList.contains('hidden')) renderCharGrid();
  maybeShowTrialPopup();
});

socket.on('notice', toast);
// Kicked by the moderator: go back to the join screen with a message.
socket.on('kicked', (info) => {
  try {
    sessionStorage.setItem('kicked', info?.reset ? 'reset' : '1');
  } catch {}
  me = null;
  location.reload();
});
try {
  const why = sessionStorage.getItem('kicked');
  if (why) {
    sessionStorage.removeItem('kicked');
    $('joinError').textContent = why === 'reset' ? '🔄 The moderator reset the game. Join again and pick your character!' : 'You were removed from the game by the moderator.';
  }
} catch {}

socket.on('lobby:history', (list) => {
  lobbyMsgs = list;
  if (channel === 'lobby') renderMessages();
});
socket.on('lobby:message', (m) => {
  lobbyMsgs.push(m);
  if (channel === 'lobby') appendMessage(m);
  else if (!m.system) {
    lobbyUnread++;
    renderNav();
  }
});

socket.on('wolf:history', (list) => {
  wolfMsgs = list;
  if (channel === 'wolf') {
    if (!list) switchChannel('lobby');
    else renderMessages();
  }
});
socket.on('wolf:message', (m) => {
  (wolfMsgs ||= []).push(m);
  if (channel === 'wolf') appendMessage(m);
  else if (m.from !== me) {
    wolfUnread++;
    renderNav();
  }
});

// ---------- AI helper chat ----------
socket.on('ai:history', (list) => {
  aiMsgs = list || [];
  if (inAiChat()) renderMessages();
});
socket.on('ai:message', (m) => {
  if (aiMsgs.some((x) => x.id === m.id)) return;
  aiMsgs.push(m);
  if (inAiChat()) appendMessage(aiView(m));
  else if (m.role === 'assistant' && !m.pending) {
    modUnread++;
    renderNav();
  }
});
// An answer changed: started thinking, finished, or failed.
socket.on('ai:update', (m) => {
  const i = aiMsgs.findIndex((x) => x.id === m.id);
  if (i >= 0) aiMsgs[i] = m;
  else aiMsgs.push(m);
  if (inAiChat()) {
    const node = $('messages').querySelector(`[data-mid="ai${m.id}"]`);
    if (node) node.replaceWith(aiNode(m));
    else appendMessage(aiView(m));
    scrollIfNear();
  } else if (!m.pending) {
    modUnread++;
    renderNav();
  }
  if (!m.pending && state) renderComposer();
});
// Words of an answer as they come in.
socket.on('ai:delta', ({ id, piece }) => {
  const m = aiMsgs.find((x) => x.id === id);
  if (!m) return;
  m.text += piece;
  m.pending = 'writing';
  if (!inAiChat()) return;
  const node = $('messages').querySelector(`[data-mid="ai${id}"]`);
  if (!node) return;
  const b = node.querySelector('.bubble');
  b.classList.remove('ai-wait');
  b.textContent = m.text;
  scrollIfNear();
});
// asker: whose AI chat this is (the moderator reads players' chats).
function aiView(m, asker = me) {
  return { id: 'ai' + m.id, from: m.role === 'user' ? asker : 'Village Helper', text: m.text, ts: m.ts, ai: m };
}
function aiNode(m, asker = me) {
  const box = $('messages');
  const before = lastRendered;
  lastRendered = null;
  appendMessage(aiView(m, asker), false);
  lastRendered = before;
  return box.lastElementChild; // appendMessage added it at the end; the caller moves it into place
}
function scrollIfNear() {
  const box = $('messages');
  if (box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
}

socket.on('mod:thread', (list) => {
  myThread = list;
  if (channel === 'mod' && !amMod()) renderMessages();
});
// Moderator: every player's AI helper chat, shown in their inbox tab.
socket.on('ai:threads', (threads) => {
  aiThreads = threads || {};
  if (channel === 'mod' && amMod()) renderMessages();
});
socket.on('ai:mod', ({ thread, message }) => {
  const list = (aiThreads[thread] ||= []);
  const i = list.findIndex((x) => x.id === message.id);
  if (i >= 0) list[i] = message;
  else list.push(message);
  if (channel === 'mod' && amMod() && selectedThread === thread) {
    const node = $('messages').querySelector(`[data-mid="ai${message.id}"]`);
    if (node) node.replaceWith(aiNode(message, displayName(thread)));
    else appendMessage(aiView(message, displayName(thread)));
  }
});
socket.on('mod:threads', (threads) => {
  modThreads = threads;
  if (channel === 'mod' && amMod()) renderAll();
});
socket.on('mod:message', ({ thread, message }) => {
  if (amMod()) {
    (modThreads[thread] ||= []).push(message);
    if (channel === 'mod' && selectedThread === thread) appendMessage(message);
    else if (message.from !== me) unreadThreads.add(thread);
  } else {
    myThread.push(message);
    if (channel === 'mod') appendMessage(message);
  }
  if (amMod() && message.action?.target) toast(`🌙 ${message.from} chose to ${ACTION_TEXT[message.action.kind].verb} ${message.action.target}.`);
  if (channel !== 'mod' && message.from !== me) modUnread++;
  renderNav();
  if (channel === 'mod' && amMod()) renderThreadTabs();
});

// A private message was edited (a changed or locked-in night pick): swap it in place.
socket.on('mod:update', ({ thread, message }) => {
  const list = amMod() ? modThreads[thread] : myThread;
  if (!list) return;
  const i = list.findIndex((m) => m.id === message.id);
  if (i < 0) return;
  list[i] = message;
  const viewing = channel === 'mod' && (amMod() ? selectedThread === thread : true);
  if (viewing) {
    const box = $('messages');
    const top = box.scrollTop;
    renderMessages();
    box.scrollTop = Math.min(top, box.scrollHeight);
    const node = box.querySelector(`[data-mid="${message.id}"] .bubble`);
    if (node && !message.action?.locked) {
      node.classList.remove('flash');
      void node.offsetWidth;
      node.classList.add('flash');
    }
  }
  if (amMod() && message.action?.target && !message.action.locked) toast(`🌙 ${message.from} changed to ${ACTION_TEXT[message.action.kind].verb} ${message.action.target}.`);
});

socket.on('phase:changed', ({ phase, silent }) => {
  setPhase(phase, !silent);
  if (!silent && phase === 'night' && state?.me?.wolfAccess && !amMod()) setTimeout(() => toast(dkMode() ? '🎡 Amusement Mile is open. Time to scheme!' : '🐺 The wolf den is open. Plan your target!'), 1800);
  if (state) renderAll(false);
});

socket.on('role:assigned', ({ role }) => {
  if (!role) return toast('The moderator removed your role.');
  const r = ROLE[role];
  // Wait for any open pop-up (like the morning news) before showing a new role.
  const show = () => openModal((card) => {
    const art = el('div', 'art role');
    art.innerHTML = ART[role];
    card.append(art);
    card.append(el('div', 'role-kicker', 'Your secret role'));
    const article = { joker: 'the ', vigilante: 'the ', batman: '' }[role] ?? (/^[aeiou]/i.test(r.label) ? 'an ' : 'a ');
    // Names like "The Batman" or "Harley Quinn" need no "a" in front.
    const named = DK_VILLAINS.includes(role) || (dkMode() && DK_SKIN[role] && role !== 'civilian');
    card.append(el('h2', '', `You are ${named ? '' : article}${r.label}`));
    card.append(el('p', '', r.desc));
    card.append(el('p', 'hint', 'Only you and the moderator can see this.'));
    const actions = el('div', 'actions');
    actions.append(btn('btn-primary', 'Got it', closeModal));
    card.append(actions);
  });
  if ($('modal').classList.contains('hidden')) show();
  else clueQueue.push({ __result: show });
});
socket.on('role:cleared', () => toast('New game: all roles were cleared.'));

socket.on('trial:started', () => {
  trialPopupShownFor = null;
});
socket.on('trial:cleared', closeModal);
socket.on('trial:result', (r) => {
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = ART.scales;
    card.append(art);
    card.append(el('h2', '', `${dkMode() ? 'Gotham' : 'The village'} has decided. ${r.accused} is`));
    card.append(el('div', 'verdict ' + r.result, r.result.toUpperCase()));
    if (r.result === 'guilty') card.append(killVideo(r.wolf ? 'wolfdeath' : 'vote'));
    const tally = el('div', 'tally');
    tally.append(el('span', 'g', `${r.guilty} guilty`), el('span', 'i', `${r.innocent} innocent`));
    card.append(tally);
    const ul = el('ul', 'vote-list');
    if (r.votes.length === 0) ul.append(el('li', '', 'Nobody voted.'));
    r.votes.forEach((v, i) => {
      const li = el('li');
      li.style.animationDelay = 0.25 + i * 0.08 + 's';
      li.append(avatar(v.name, 'sm'), el('span', 'n', v.name), el('span', 'tag ' + (v.vote === 'guilty' ? 'muted' : 'mod'), v.vote));
      if (v.vote === 'innocent') li.lastChild.style.cssText = 'background:var(--success-soft);color:var(--success)';
      ul.append(li);
    });
    card.append(ul);
    if (r.result === 'guilty') {
      card.append(el('p', '', `${r.accused} is muted and can only talk to the moderator until the chat is wiped.`));
    }
    const actions = el('div', 'actions');
    actions.append(btn('btn-primary', 'Close', closeModal));
    card.append(actions);
  });
});

// ---------- Phase ----------
function setPhase(phase, animate) {
  currentPhase = phase;
  window.setScene?.(phase);
  document.body.classList.toggle('night', phase === 'night');
  const corner = $('phaseCorner');
  renderPhaseDisplay();
  if (!animate) {
    corner.innerHTML = ART[phase];
    return;
  }
  const ov = $('phaseOverlay');
  const flash = $('phaseFlash');
  clearTimeout(setPhase._t1);
  clearTimeout(setPhase._t2);
  ov.className = 'phase-overlay';
  ov.removeAttribute('style');
  ov.innerHTML = ART[phase] + `<div class="caption">${phase === 'night' ? 'Night falls' : 'Day breaks'}</div>`;
  corner.style.visibility = 'hidden';
  flash.classList.add('on');
  // Pop in at the center (0.45s), hold briefly, then glide into the corner (0.55s). About 1.75s in all.
  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('show')));
  setPhase._t1 = setTimeout(() => {
    flash.classList.remove('on');
    const r = corner.getBoundingClientRect();
    ov.style.setProperty('--dx', r.left + r.width / 2 - window.innerWidth / 2 + 'px');
    ov.style.setProperty('--dy', r.top + r.height / 2 - window.innerHeight / 2 + 'px');
    ov.style.setProperty('--s', r.width / ov.offsetWidth);
    ov.classList.add('fly');
    setPhase._t2 = setTimeout(() => {
      corner.innerHTML = ART[phase];
      corner.style.visibility = '';
      corner.classList.remove('land');
      void corner.offsetWidth;
      corner.classList.add('land');
      ov.className = 'phase-overlay hidden';
    }, 560);
  }, 1200);
}

function renderPhaseDisplay() {
  const d = $('phaseDisplay');
  d.innerHTML = '';
  const art = el('div', 'art');
  art.innerHTML = ART[currentPhase];
  const txt = el('div');
  if (state && state.gameState !== 'running') {
    art.innerHTML = ART.night;
    txt.append(el('div', 'p-name', 'Not started'), el('div', 'p-sub', state.gameState === 'assigning' ? 'Roles are being handed out.' : 'Waiting for players to join.'));
    return d.append(art, txt);
  }
  txt.append(el('div', 'p-name', currentPhase === 'night' ? 'Night' : 'Day'));
  txt.append(el('div', 'p-sub', currentPhase === 'night' ? (dkMode() ? 'The villains are out in Gotham…' : 'The werewolves are awake…') : dkMode() ? 'Discuss and find the villains.' : 'Discuss and find the wolves.'));
  d.append(art, txt);
}

// ---------- Trial ----------
function canVote() {
  const t = state?.trial;
  if (!t || !t.open) return false;
  return !amMod() && !amMuted() && key(t.accused) !== key(me) && !state.me.arrestedToday;
}
const myVote = () => state?.trial?.votes.find((v) => key(v.name) === key(me));
function eligibleCount() {
  const t = state.trial;
  return state.users.filter((u) => !u.moderator && !u.muted && key(u.name) !== key(t.accused)).length;
}

function maybeShowTrialPopup() {
  const t = state?.trial;
  if (!t || !t.open || trialPopupShownFor === t.accused) return;
  trialPopupShownFor = t.accused;
  const voting = canVote();
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = ART.scales;
    card.append(art);
    card.append(el('h2', '', `${t.accused} is on trial!`));
    const town = dkMode() ? 'Gotham' : 'The village';
    let text = `${town} is voting.`;
    if (key(t.accused) === key(me)) text = `${town} is deciding your fate. Plead your case in the main chat!`;
    else if (state.me.arrestedToday) text = 'You are arrested, so you cannot vote today.';
    else if (canVote()) text = 'Is this person guilty? Everyone will see who voted what when the trial ends.';
    card.append(el('p', '', text));
    const actions = el('div', 'actions');
    if (voting) {
      actions.append(
        btn('btn-danger', 'Guilty', () => {
          socket.emit('trial:vote', 'guilty');
          closeModal();
        }),
        btn('btn-success', 'Innocent', () => {
          socket.emit('trial:vote', 'innocent');
          closeModal();
        })
      );
    }
    // Voters must choose Guilty or Innocent; everyone else can close it.
    else actions.append(btn('btn-ghost', 'Close', closeModal));
    card.append(actions);
  }, voting);
}

function openTrialPicker() {
  const candidates = state.users.filter((u) => !u.moderator);
  if (candidates.length === 0) return toast('There is nobody to put on trial yet.');
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = ART.scales;
    card.append(art);
    card.append(el('h2', '', 'Who goes on trial?'));
    card.append(el('p', '', 'Everyone will be asked to vote guilty or innocent.'));
    const list = el('div', 'pick-list');
    for (const u of candidates) {
      const b = el('button');
      b.type = 'button';
      b.append(avatar(u.name, 'sm'), el('span', '', u.name));
      if (u.muted) b.append(el('span', 'tag muted', 'muted'));
      b.onclick = () => {
        socket.emit('trial:start', u.name);
        closeModal();
      };
      list.append(b);
    }
    card.append(list);
    const actions = el('div', 'actions');
    actions.append(btn('btn-ghost', 'Cancel', closeModal));
    card.append(actions);
  });
}

$('dayBtn').onclick = () => currentPhase !== 'day' && socket.emit('phase:set', 'day');
$('nightBtn').onclick = () => currentPhase !== 'night' && socket.emit('phase:set', 'night');
$('trialBtn').onclick = openTrialPicker;
$('addBotsBtn').onclick = () => socket.emit('bots:add', Number($('botCount').value));
$('removeBotsBtn').onclick = () => socket.emit('bots:remove');

// ---------- Roles ----------
// The role picker: a small box with the roles in two columns, village side and wolf side.
const pickVillage = () => (dkMode() ? ['civilian', 'doctor', 'detective', 'officer'] : ['civilian', 'doctor', 'detective', 'officer', 'mother', 'father', 'son']);
const pickWolf = () => (dkMode() ? DK_VILLAINS : ['werewolf']);
const PICK_LATER = ['vigilante', 'batman', 'joker'];
$('rolePickBtn').onclick = () => selectedThread && openRolePicker(displayName(selectedThread));
function openRolePicker(name) {
  const cur = state.modView?.roles[key(name)] || null;
  const give = (r) => {
    socket.emit('mod:role', { to: name, role: r });
    closeModal();
  };
  const opt = (r) => {
    const on = cur === r || (r === 'werewolf' && cur === 'serialkiller');
    const b = el('button', 'rp-role' + (on ? ' on' : ''));
    b.type = 'button';
    b.append(roleIcon(r), el('span', '', ROLE[r].label));
    if (on) b.append(el('span', 'rp-tick', '✓'));
    b.onclick = () => give(r);
    if (!on && roleTakenByOther(r, name)) {
      b.disabled = true;
      b.classList.add('taken');
      const holder = Object.entries(state.modView.roles).find(([, x]) => x === r)[0];
      b.append(el('span', 'rp-taken', displayName(holder)));
    }
    return b;
  };
  openModal((card) => {
    card.classList.add('role-picker');
    if (isPhone()) card.classList.add('rp-tiles'); // phones: role tiles, three per row
    card.append(el('h2', '', `Role for ${name}`));
    const grid = el('div', 'rp-grid');
    const col = (title, cls, list) => {
      const c = el('div', 'rp-col ' + cls);
      c.append(el('div', 'rp-col-title', title));
      for (const r of list) c.append(opt(r));
      return c;
    };
    grid.append(col(dkMode() ? '🦇 Gotham' : '🧑‍🌾 Village', 'rp-village', pickVillage()), col(dkMode() ? '🃏 Villains' : '🐺 Wolves', 'rp-wolf', pickWolf()));
    card.append(grid);
    const later = el('details', 'rp-later' + (dkMode() ? ' hidden' : ''));
    later.append(el('summary', '', 'Family transformations'));
    const row = el('div', 'rp-later-row');
    for (const r of PICK_LATER) row.append(opt(r));
    later.append(row);
    card.append(later);
    const actions = el('div', 'actions');
    actions.append(btn('btn-ghost', 'Clear role', () => give(null)), btn('btn-primary', 'Close', closeModal));
    card.append(actions);
  });
}

// ---------- Channels ----------
function switchChannel(c) {
  channel = c;
  if (c === 'mod') modUnread = 0;
  if (c === 'lobby') lobbyUnread = 0;
  if (c === 'wolf') wolfUnread = 0;
  closeDrawers();
  renderAll();
  focusComposer();
}
document.querySelectorAll('.nav-item[data-channel]').forEach((b) => (b.onclick = () => switchChannel(b.dataset.channel)));

// ---------- Sending ----------
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('msgInput').value.trim();
  if (!text) return;
  if (channel === 'lobby') socket.emit('lobby:send', text);
  else if (channel === 'mod') {
    if (amMod()) {
      if (!selectedThread) return toast('Pick a player to message.');
      socket.emit('mod:send', { to: displayName(selectedThread), text });
    } else if (aiMode) {
      if (state.me.ai?.busy) return toast('Wait for your last answer first.');
      socket.emit('ai:ask', text);
    } else socket.emit('mod:send', { text });
  } else if (channel === 'wolf') socket.emit('wolf:send', text);
  $('msgInput').value = '';
});

// ---------- Rendering ----------
function renderAll(redrawMessages = true) {
  if (!state) return;
  renderNav();
  renderHeader();
  renderTrialBanner();
  document.body.classList.toggle('is-mod', amMod());
  renderPhoneDock();
  renderPhonePlayers();
  renderResultsPop();
  renderActionPop();
  renderCluesBar();
  renderStartScreen();
  renderModOverview();
  renderThreadTabs();
  renderComposer();
  renderPanel();
  updateAbilityBox();
  document.body.classList.toggle('has-mod', !!state.moderator);
  renderRoleFx();
  if (redrawMessages || !renderAll._ch || renderAll._ch !== channelKey()) renderMessages();
  renderAll._ch = channelKey();
}
const channelKey = () => channel + '|' + (channel === 'mod' ? (amMod() ? 'm:' + selectedThread : 'p') : '');

function renderNav() {
  if (!state) return;
  const mc = $('meCard');
  mc.innerHTML = '';
  mc.title = 'Change your character';
  mc.onclick = openCharSelect;
  const a = avatar(me);
  a.append(el('span', 'dot'));
  const who = el('div', 'who');
  who.append(el('div', 'name', me));
  const myRole = state.me.role && ROLE[state.me.role];
  const status = el('div', 'status');
  if (amMod()) status.textContent = '🛡️ Moderator';
  else if (myRole) status.append(roleIcon(state.me.role), document.createTextNode(' ' + myRole.label));
  else status.textContent = 'Player · no role yet';
  if (amMuted()) status.append(document.createTextNode(' · 🔇 muted'));
  who.append(status);
  mc.append(a, who);

  document.querySelectorAll('.nav-item[data-channel]').forEach((b) => b.classList.toggle('selected', b.dataset.channel === channel));
  $('modChannelLabel').textContent = amMod() ? 'Moderator inbox' : 'Talk to moderator';
  const setPill = (id, n) => {
    $(id).textContent = n > 9 ? '9+' : n;
    $(id).classList.toggle('hidden', n === 0);
  };
  setPill('modUnread', modUnread);
  setPill('lobbyUnread', lobbyUnread);
  setPill('wolfUnread', wolfUnread);
  $('wolfNav').classList.toggle('hidden', !state.me.wolfAccess);
  $('wolfMeta').textContent = state.phase === 'night' ? '' : '🔒';
  $('wolfNav').title = state.phase === 'night' ? 'Open now' : 'Opens at night';
  $('disguiseNav').classList.toggle('hidden', !state.me.disguise);
  if (state.me.disguise) $('disguiseMeta').textContent = '';
  document.querySelector('#wolfNav .nav-label').textContent = dkMode() ? 'Amusement Mile' : 'Wolf den';
  document.querySelector('#wolfNav .ri').src = (ROLE_IMG[dkMode() ? 'dkjoker' : 'werewolf'] || '').replace('/roles/', '/roles/sm/');
  $('cardNav').classList.toggle('hidden', !state.me.canCard);
  $('cardMeta').textContent = state.me.callingCard ? '✓' : '';
  $('manifestoNav').classList.toggle('hidden', amMod());
  renderSideBox();
  $('manifestoMeta').textContent = state.me.dead ? '🔒' : state.me.manifesto ? '✓' : '';

}

function renderHeader() {
  const title = $('chatTitle');
  const sub = $('chatSub');
  const actions = $('headerActions');
  actions.innerHTML = '';
  if (channel === 'lobby') {
    title.textContent = '# Main lobby';
    sub.textContent = 'Everyone can see this chat';
  } else if (channel === 'mod') {
    title.textContent = amMod() ? '🛡️ Moderator inbox' : '🛡️ Talk to the moderator';
    const a = state.me.ai || {};
    sub.textContent = amMod()
      ? 'Private chats. Each player only sees their own.'
      : aiMode
        ? a.enabled
          ? `🤖 Asking the AI · the moderator can read it too · ${a.left} of ${a.max} questions left`
          : '🤖 The AI is offline. The My role button still works.'
        : state.moderator
          ? `Private. Only you and ${state.moderator} can see this.`
          : 'Private. No moderator yet, but your messages will be waiting.';
    if (!amMod()) {
      const rb = btn('btn-soft ai-role-btn', '🎭 My role', () => socket.emit('ai:myrole'));
      rb.title = 'An instant explanation of your role';
      actions.append(rb);
    }
  } else if (channel === 'wolf') {
    const wolves = (amMod() ? Object.entries(state.modView?.roles || {}).filter(([, r]) => r === 'werewolf' || r === 'joker' || DK_VILLAINS.includes(r)).map(([k]) => displayName(k)) : state.me.wolfmates);
    title.textContent = dkMode() ? '🎡 Amusement Mile' : '🐺 Wolf den';
    sub.textContent = dkMode()
      ? (state.phase === 'night' ? 'Open' : 'Closed until night') + " · where Gotham's villains meet to scheme"
      : (state.phase === 'night' ? 'Open now' : 'Closed until night') + ` · secret chat for the werewolves${wolves.length ? ': ' + wolves.join(', ') : ''}`;
  }
}

function renderTrialBanner() {
  const t = state.trial;
  const banner = $('trialBanner');
  const show = !!t && t.open && channel === 'lobby';
  const wasHidden = banner.classList.contains('hidden');
  banner.classList.toggle('hidden', !show);
  if (!show) return;
  if (!wasHidden && banner.dataset.sig === sigOf(t)) return; // avoid re-animating
  banner.dataset.sig = sigOf(t);
  banner.innerHTML = '';
  const sc = el('div', 'scales');
  sc.innerHTML = ART.scalesSmall;
  const txt = el('div', 't-text');
  txt.append(el('div', 't-title', `${t.accused} is on trial`));
  const mine = myVote();
  txt.append(el('div', 't-sub', `${t.votes.length} of ${eligibleCount()} votes in` + (mine ? ' · your vote is in (you can change it)' : '')));
  banner.append(sc, txt);
  if (canVote()) {
    const acts = el('div', 't-actions');
    acts.append(
      btn('btn-danger', 'Guilty', () => socket.emit('trial:vote', 'guilty')),
      btn('btn-success', 'Innocent', () => socket.emit('trial:vote', 'innocent'))
    );
    banner.append(acts);
  }
}
const sigOf = (t) => [t.accused, t.votes.map((v) => v.name).join(','), !!myVote(), canVote(), state.users.length].join('|');

function threadKeys() {
  const keys = new Set(state.users.filter((u) => !u.moderator).map((u) => key(u.name)));
  for (const k of Object.keys(modThreads)) if (k !== key(me)) keys.add(k);
  return keys;
}

function renderThreadTabs() {
  const tabs = $('threadTabs');
  const show = amMod() && channel === 'mod';
  // Phones use the players box on the left instead of the row of tabs and the role bar.
  tabs.classList.toggle('hidden', !show || isPhone());
  if (show) {
    const keys = threadKeys();
    if (selectedThread && !keys.has(selectedThread)) selectedThread = null;
    if (!selectedThread && keys.size) selectedThread = [...keys][0];
    unreadThreads.delete(selectedThread);
    tabs.innerHTML = '';
    if (keys.size === 0) tabs.append(el('span', 'chat-sub', 'Players who join will show up here.'));
    for (const k of keys) {
      const online = state.users.some((u) => key(u.name) === k);
      const b = el('button', 'thread-tab' + (k === selectedThread ? ' on' : '') + (online ? '' : ' offline'));
      b.type = 'button';
      const tr = state.modView?.roles[k];
      b.append(avatar(displayName(k), 'sm'), el('span', '', displayName(k) + (online ? '' : ' (left)')));
      if (unreadThreads.has(k)) b.append(el('span', 'new'));
      b.onclick = () => {
        selectedThread = k;
        renderAll();
      };
      tabs.append(b);
    }
  }
  $('roleBar').classList.toggle('hidden', !show || !selectedThread || isPhone());
  renderPhoneThreads(show && isPhone());
  renderCheckBar(show);
  $('roleTarget').textContent = selectedThread ? displayName(selectedThread) : '';
  const cur = selectedThread && state.modView?.roles[selectedThread];
  const pb = $('rolePickBtn');
  pb.innerHTML = '';
  if (cur) pb.append(roleIcon(cur), document.createTextNode(` ${ROLE[cur].label} · change ▾`));
  else pb.append(document.createTextNode('🎭 Choose a role ▾'));
}

// Phone, moderator inbox: a box on the left with every player. Scroll, tap one to open their chat,
// and change the chosen player's role with the button at the top.
function renderPhoneThreads(show) {
  const box = $('phoneThreads');
  box.classList.toggle('hidden', !show);
  if (!show) return;
  const dock = $('phoneDock');
  const top = phoneTop() + dock.offsetHeight + 8;
  box.style.top = top + 'px';
  box.style.maxHeight = Math.max(160, $('composer').offsetTop - top - 10) + 'px';
  const keys = [...threadKeys()];
  const roles = state.modView?.roles || {};
  const sig = JSON.stringify([keys, selectedThread, roles, [...unreadThreads], state.dead, state.users.map((u) => u.name)]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const oldList = box.querySelector('.pt-list');
  const scroll = oldList ? oldList.scrollTop : 0;
  box.innerHTML = '';
  const head = el('div', 'pt-head');
  head.append(el('span', 'pt-title', `👥 Players ${keys.length}`));
  box.append(head);
  if (selectedThread) {
    const cur = roles[selectedThread];
    const rb = el('button', 'pt-role' + (cur ? ' has' : ''));
    rb.type = 'button';
    rb.title = `Change ${displayName(selectedThread)}'s role`;
    if (cur) rb.append(roleIcon(cur), el('span', 'pt-role-label', ROLE[cur].label));
    else rb.append(el('span', 'pt-role-label', '🎭 Pick role'));
    rb.append(el('span', 'pt-caret', '▾'));
    rb.onclick = () => openRolePicker(displayName(selectedThread));
    box.append(rb);
  }
  const list = el('div', 'pt-list');
  if (!keys.length) list.append(el('div', 'pt-empty', 'Players who join show up here.'));
  for (const k of keys) {
    const online = state.users.some((u) => key(u.name) === k);
    const dead = state.dead?.includes(k);
    const row = el('button', 'pt-row' + (k === selectedThread ? ' on' : '') + (online ? '' : ' offline') + (dead ? ' dead' : ''));
    row.type = 'button';
    const txt = el('div', 'pt-text');
    txt.append(el('div', 'pt-name', displayName(k) + (online ? '' : ' (left)')));
    if (roles[k]) {
      const sub = el('div', 'pt-sub');
      sub.append(roleIcon(roles[k]), document.createTextNode(' ' + ROLE[roles[k]].label + (dead ? ' · dead' : '')));
      txt.append(sub);
    }
    row.append(avatar(displayName(k), 'sm'), txt);
    if (unreadThreads.has(k)) row.append(el('span', 'pt-new'));
    row.onclick = () => {
      selectedThread = k;
      renderAll();
    };
    list.append(row);
  }
  box.append(list);
  list.scrollTop = scroll;
  // Keep the chosen player in view.
  if (!scroll) list.querySelector('.pt-row.on')?.scrollIntoView({ block: 'nearest' });
}

// The moderator answers an Detective's question: is this player a wolf or a civilian?
function renderCheckBar(show) {
  const bar = $('checkBar');
  const askerRole = selectedThread && state.modView?.roles[selectedThread];
  const visible = show && askerRole === 'detective' && !dkMode();
  bar.classList.toggle('hidden', !visible);
  if (!visible) return;
  $('checkAsker').textContent = displayName(selectedThread);
  const sel = $('checkTarget');
  const prev = sel.value;
  const options = state.users.filter((u) => !u.moderator && key(u.name) !== selectedThread).map((u) => u.name);
  const sig = selectedThread + '|' + options.join(',');
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.innerHTML = '';
    sel.append(new Option('Who did they ask about?', ''));
    for (const n of options) sel.append(new Option(n, n));
    if (options.includes(prev)) sel.value = prev;
  }
  // Pre-fill with the player the Detective picked tonight (once per new pick).
  const picked = (state.modView?.nightActions || []).find((a) => a.kind === 'investigate' && key(a.actor) === selectedThread)?.target;
  const mark = selectedThread + '|' + picked;
  if (picked && options.includes(picked) && sel.dataset.prefilled !== mark) {
    sel.value = picked;
    sel.dataset.prefilled = mark;
  }
  updateCheckHint();
}
function updateCheckHint() {
  const target = $('checkTarget').value;
  const real = target && state.modView?.roles[key(target)];
  const hint = $('checkHint');
  const isWolf = real === 'werewolf' || real === 'serialkiller' || real === 'joker';
  hint.textContent = '';
  if (real) hint.append(document.createTextNode('(really '), roleIcon(real), document.createTextNode(` ${ROLE[real].label})`));
  else if (target) hint.textContent = '(no role yet)';
  document.querySelectorAll('#checkBar [data-check]').forEach((b) => {
    b.disabled = !target;
    b.classList.toggle('current', !!real && (b.dataset.check === 'wolf') === isWolf);
  });
}
$('checkTarget').onchange = updateCheckHint;
document.querySelectorAll('#checkBar [data-check]').forEach((b) => {
  b.onclick = () => {
    const target = $('checkTarget').value;
    if (!selectedThread || !target) return toast('Pick who they asked about first.');
    socket.emit('mod:check', { to: displayName(selectedThread), target, result: b.dataset.check });
    $('checkTarget').value = '';
    updateCheckHint();
  };
});

// The 🤖 AI switch in Talk to moderator.
$('aiToggle').onclick = () => {
  aiMode = !aiMode;
  renderHeader();
  renderComposer();
  focusComposer();
};
function renderComposer() {
  const showToggle = channel === 'mod' && !amMod();
  $('aiToggle').classList.toggle('hidden', !showToggle);
  $('aiToggle').classList.toggle('on', aiMode);
  $('aiToggle').setAttribute('aria-pressed', String(aiMode));
  $('composer').classList.toggle('ai-mode', showToggle && aiMode);
  const input = $('msgInput');
  const send = $('composer').querySelector('button');
  let disabled = false;
  let ph = 'Type a message…';
  if (channel === 'lobby') {
    if (amMuted()) {
      disabled = true;
      ph = state.me.dead && state.dead?.includes(key(me)) ? '💀 You are dead. You can only talk to the moderator.' : '🔇 You are muted. You can only talk to the moderator.';
    } else ph = 'Message everyone…';
  } else if (channel === 'mod') {
    if (amMod()) {
      disabled = !selectedThread;
      ph = selectedThread ? `Private message to ${displayName(selectedThread)}…` : 'No player selected';
    } else if (aiMode) {
      const a = state.me.ai || {};
      if (a.busy) {
        disabled = true;
        ph = '🤖 Thinking about your last question…';
      } else ph = a.enabled ? '🤖 Ask the AI about the rules, your role or what happened…' : '🤖 Ask about your role or the rules (the AI is offline)…';
    } else ph = 'Message the moderator privately…';
  } else if (channel === 'wolf') {
    if (amMod()) ph = dkMode() ? 'Message the villains (as moderator)…' : 'Message the wolves (as moderator)…';
    else if (state.phase !== 'night') {
      disabled = true;
      ph = dkMode() ? '🌙 Amusement Mile opens at night.' : '🌙 The wolf den opens at night.';
    } else if (amMuted()) {
      disabled = true;
      ph = state.me.dead && state.dead?.includes(key(me)) ? '💀 You are dead. You can only talk to the moderator.' : '🔇 You are muted. You can only talk to the moderator.';
    } else ph = dkMode() ? 'Scheme with the villains…' : 'Plan your target with the pack…';
  }
  input.disabled = disabled;
  send.disabled = disabled;
  input.placeholder = ph;
  $('composer').classList.toggle('locked', disabled);
}

// How many special roles The Dark Knight deals.
function dkSpecial(cfg) {
  return 1 + ['harley', 'ivy', 'clayface'].filter((r) => cfg[r]).length + cfg.doctor + cfg.detective + cfg.officer;
}
function familyOn(cfg, players) {
  return cfg.family === 'on' || (cfg.family === 'auto' && players >= 20);
}
function renderRolesCard() {
  const card = $('rolesCard');
  card.classList.toggle('hidden', !amMod());
  if (!amMod() || !state.modView) return;
  const cfg = state.modView.roleConfig;
  const players = state.users.filter((u) => !u.moderator).length;
  const fam = familyOn(cfg, players);
  const special = cfg.werewolf + cfg.doctor + cfg.detective + cfg.officer + (fam ? 3 : 0);
  const civilians = Math.max(players - special, 0);
  const box = $('roleSetup');
  box.innerHTML = '';
  const row = (r, label) => {
    const d = el('div', 'stepper-row');
    const lab = roleLabel('stepper-label', r === 'werewolf' && cfg.werewolf === 1 ? 'serialkiller' : r, label);
    const step = el('div', 'stepper');
    const set = (n) => socket.emit('roles:config', { ...cfg, [r]: Math.max(0, Math.min(20, n)) });
    const minus = el('button', '', '−');
    minus.type = 'button';
    minus.disabled = cfg[r] === 0;
    minus.onclick = () => set(cfg[r] - 1);
    const plus = el('button', '', '+');
    plus.type = 'button';
    plus.onclick = () => set(cfg[r] + 1);
    step.append(minus, el('b', '', String(cfg[r])), plus);
    d.append(lab, step);
    if (cfg[r] === 0) d.classList.add('off');
    box.append(d);
  };
  if (dkMode()) {
    // The Dark Knight: one Joker, optional villains, and Gotham's defenders.
    const jr = el('div', 'stepper-row');
    jr.append(roleLabel('stepper-label', 'dkjoker', 'The Joker'), el('b', 'civ-count', '1'));
    box.append(jr);
    for (const r of ['harley', 'ivy', 'clayface']) {
      const d = el('div', 'stepper-row' + (cfg[r] ? '' : ' off'));
      d.append(roleLabel('stepper-label', r, ROLE[r].label));
      const sg = el('div', 'mini-seg');
      for (const [v, t] of [[true, 'On'], [false, 'Off']]) {
        const b = el('button', cfg[r] === v ? 'on' : '', t);
        b.type = 'button';
        b.onclick = () => socket.emit('roles:config', { ...cfg, [r]: v });
        sg.append(b);
      }
      d.append(sg);
      box.append(d);
    }
    row('doctor', 'Thomas Wayne');
    row('detective', 'The Batman');
    row('officer', 'Commissioner Gordon');
    const dr = el('div', 'stepper-row');
    dr.append(el('span', 'stepper-label', '🎚️ Difficulty'));
    const dsg = el('div', 'mini-seg');
    for (const [v, t] of [['normal', 'Normal'], ['hard', 'Hard']]) {
      const b = el('button', cfg.difficulty === v ? 'on' : '', t);
      b.type = 'button';
      b.title = v === 'hard' ? 'Hard: nobody is told when a villain is sent to Arkham' : 'Normal: everyone is told when a villain is sent to Arkham';
      b.onclick = () => socket.emit('roles:config', { ...cfg, difficulty: v });
      dsg.append(b);
    }
    dr.append(dsg);
    box.append(dr);
    const sp = dkSpecial(cfg);
    const cz = el('div', 'stepper-row');
    cz.append(roleLabel('stepper-label', 'civilian', 'Citizens'), el('b', 'civ-count', String(Math.max(players - sp, 0))));
    box.append(cz);
    const sm = $('roleSummary');
    sm.className = 'role-summary' + (sp > players ? ' warn' : '');
    sm.textContent = sp > players ? `You picked ${sp} special roles but only ${players} player${players === 1 ? ' is' : 's are'} here.` : 'The Joker kills each night. Villains voted out are sent to Arkham.';
    $('randomizeBtn').disabled = players === 0 || sp > players;
    return;
  }
  row('werewolf', cfg.werewolf === 1 ? 'Serial Killer' : 'Werewolves');
  row('doctor', 'Doctors');
  row('detective', 'Detectives');
  row('officer', 'Officers');
  // The family trio: dealt automatically with 20+ players, or switched on/off.
  const famRow = el('div', 'stepper-row family-row' + (fam ? '' : ' off'));
  const famLab = el('span', 'stepper-label');
  for (const r of ['mother', 'father', 'son']) famLab.append(roleIcon(r));
  famLab.append(document.createTextNode(' Family'));
  const seg = el('div', 'mini-seg');
  for (const [m, t] of [['auto', 'Auto 20+'], ['on', 'On'], ['off', 'Off']]) {
    const b = el('button', cfg.family === m ? 'on' : '', t);
    b.type = 'button';
    b.title = m === 'auto' ? 'Mother, Father and Son are dealt when 20 or more players have joined' : m === 'on' ? 'Always deal the family' : 'Never deal the family';
    b.onclick = () => socket.emit('roles:config', { ...cfg, family: m });
    seg.append(b);
  }
  famRow.append(famLab, seg);
  box.append(famRow);
  // Difficulty and Batman's Interrogate.
  const toggleRow = (label, field, opts, title) => {
    const r = el('div', 'stepper-row');
    r.append(el('span', 'stepper-label', label));
    const sg = el('div', 'mini-seg');
    for (const [v, t] of opts) {
      const b = el('button', cfg[field] === v ? 'on' : '', t);
      b.type = 'button';
      b.title = title(v);
      b.onclick = () => socket.emit('roles:config', { ...cfg, [field]: v });
      sg.append(b);
    }
    r.append(sg);
    box.append(r);
  };
  toggleRow('🎚️ Difficulty', 'difficulty', [['normal', 'Normal'], ['hard', 'Hard']], (v) =>
    v === 'hard' ? 'Hard: nothing about roles is shown on death (no family announcements, no werewolf death animation)' : 'Normal: family changes are announced and werewolf deaths show their own animation'
  );
  toggleRow('🦇 Interrogate', 'interrogate', [[true, 'On'], [false, 'Off']], (v) =>
    v ? "Batman can interrogate (only in games that start with 4+ wolves)" : 'Batman cannot interrogate'
  );
  box.lastChild.title = 'Batman gets Interrogate only in games that start with 4 or more wolves.';
  const civ = el('div', 'stepper-row');
  civ.append(roleLabel('stepper-label', 'civilian', 'Civilians'), el('b', 'civ-count', String(civilians)));
  box.append(civ);

  const sum = $('roleSummary');
  if (special > players) {
    sum.className = 'role-summary warn';
    sum.textContent = `You picked ${special} special roles but only ${players} player${players === 1 ? ' is' : 's are'} here.`;
  } else {
    sum.className = 'role-summary';
    sum.textContent =
      cfg.werewolf === 1
        ? 'With only one werewolf, they play as the Serial Killer.'
        : cfg.werewolf >= 2
          ? `${cfg.werewolf} werewolves share the wolf den at night.`
          : 'No killers in this setup.';
  }
  $('randomizeBtn').disabled = players === 0 || special > players;
  // Detective results: automatic at sunrise, or answered by the moderator.
  let om = $('detectiveMode');
  if (!om) {
    om = el('div', 'detective-mode');
    om.id = 'detectiveMode';
    $('rolesCard').append(om);
  }
  const mode = state.modView.detectiveMode;
  const sig = mode;
  if (om.dataset.sig !== sig) {
    om.dataset.sig = sig;
    om.innerHTML = '';
    om.append(roleLabel('start-label', 'detective', 'Detective results'));
    const seg = el('div', 'segmented');
    for (const [m, t] of [['auto', '⚙️ Automatic'], ['manual', '✋ Manual']]) {
      const b = el('button', mode === m ? 'on' : '', t);
      b.type = 'button';
      b.onclick = () => socket.emit('detective:mode', m);
      seg.append(b);
    }
    om.append(seg, el('p', 'hint', mode === 'auto' ? 'The Detective sees if their pick is good or bad at sunrise, by themselves.' : 'You answer the Detective with the Wolf / Civilian buttons in their chat.'));
  }
}

// Your abilities (Kill, Manifesto, Calling card). On a computer they sit in the profile box under your name;
// on iPad and other touch screens they get their own box under the chats.
function placeAbilityBox() {
  const box = $('abilityBox');
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  if (touch) {
    if (box.previousElementSibling !== document.querySelector('.side-left .nav')) document.querySelector('.side-left .nav').after(box);
  } else if (box.parentElement !== $('profileBox')) $('profileBox').append(box);
  $('profileBox').classList.toggle('with-abilities', !touch);
}
placeAbilityBox();
function updateAbilityBox() {
  const box = $('abilityBox');
  const any = [...box.querySelectorAll('.nav-item')].some((b) => !b.classList.contains('hidden'));
  box.classList.toggle('hidden', !any);
  $('profileBox').classList.toggle('has-abilities', any && box.parentElement === $('profileBox'));
}

// Computer & iPad: the night action is a tile in the chats box that opens a small pick list.
function renderActionNav() {
  const a = state.me.action;
  const show = !!a && !amMod() && !amMuted() && state.gameState === 'running';
  $('actionNav').classList.toggle('hidden', !show);
  if (!show) return;
  const [icon, label] = PHONE_ACT[a.kind];
  $('actionNavIcon').textContent = icon;
  $('actionNavLabel').textContent = label;
  $('actionNav').classList.toggle('selected', actionOpen);
  // A red dot while there's still a choice to make tonight.
  const waiting = state.phase === 'night' && a.kind !== 'arrest' && !a.target && !a.skip && !state.me.arrestedTonight && a.targets?.length;
  $('actionNavPill').classList.toggle('hidden', !waiting);
}
$('actionNav').onclick = () => {
  if (!isPhone() && getComputedStyle($('sideLeft')).position === 'fixed') closeDrawers();
  toggleActionPop();
};

function renderPanel() {
  renderPhaseDisplay();
  renderActionCard();
  renderActionNav();
  renderNightCard();

  // Moderator tools
  $('modTools').classList.toggle('hidden', !amMod());
  $('inGameTools').classList.toggle('hidden', state.gameState !== 'running');
  renderEndGame();
  const open = !!state.trial?.open;
  $('dayBtn').classList.toggle('on', state.phase === 'day');
  $('nightBtn').classList.toggle('on', state.phase === 'night');
  $('trialBtn').disabled = open;
  $('removeBotsBtn').classList.toggle('hidden', !state.users.some((u) => u.bot));

  // Trial card
  const tc = $('trialCard');
  const t = state.trial;
  tc.classList.toggle('hidden', !(t && t.open));
  if (t && t.open) {
    tc.className = 'card trial-card';
    tc.innerHTML = '';
    tc.append(el('div', 'card-title', '⚖️ Trial in progress'));
    const who = el('div', 'who');
    who.append(avatar(t.accused), el('b', '', t.accused));
    tc.append(who);
    const total = Math.max(eligibleCount(), 1);
    const lab = el('div', 'progress-label');
    lab.append(el('span', '', 'Votes in'), el('b', '', `${t.votes.length} / ${eligibleCount()}`));
    const bar = el('div', 'progress');
    const fill = el('i');
    fill.style.width = (100 * t.votes.length) / total + '%';
    bar.append(fill);
    tc.append(lab, bar);
    if (t.votes.length) {
      const v = el('div', 'voters');
      t.votes.forEach((x) => v.append(el('span', 'chip', '✓ ' + x.name)));
      tc.append(v);
    }
    if (canVote()) {
      const mine = myVote();
      const row = el('div', 'vote-row');
      row.append(
        btn('btn-danger', mine ? 'Guilty' : 'Vote guilty', () => socket.emit('trial:vote', 'guilty')),
        btn('btn-success', mine ? 'Innocent' : 'Vote innocent', () => socket.emit('trial:vote', 'innocent'))
      );
      tc.append(row);
      if (mine) tc.append(el('p', 'hint', 'Your vote is in. You can still change it.'));
    }
    if (amMod()) {
      const row = el('div', 'btn-row');
      row.append(btn('btn-primary', 'End voting', () => socket.emit('trial:end')), btn('btn-ghost', 'Cancel trial', () => socket.emit('trial:cancel')));
      tc.append(row);
    }
  }

  // Moderator seat
  const mb = $('modBox');
  mb.innerHTML = '';
  if (!state.moderator) {
    mb.append(el('p', 'hint', 'Nobody is the moderator yet. The moderator runs the game and reads private messages.'));
    mb.append(btn('btn-primary btn-block', '🛡️ Become moderator', () => socket.emit('mod:claim')));
  } else {
    const cur = el('div', 'current');
    const info = el('div');
    info.append(el('div', 'label', state.moderator + (amMod() ? ' (you)' : '')), el('div', 'sub', 'Runs the game'));
    cur.append(avatar(state.moderator), info);
    mb.append(cur);
    if (amMod()) {
      const others = state.users.filter((u) => !u.moderator && !u.bot);
      if (others.length) {
        const row = el('div', 'transfer');
        const sel = el('select');
        for (const u of others) {
          const o = el('option', '', u.name);
          o.value = u.name;
          sel.append(o);
        }
        row.append(sel, btn('btn-soft', 'Hand over', () => socket.emit('mod:transfer', sel.value)));
        mb.append(row);
      }
      mb.append(btn('btn-ghost btn-block', 'Step down', () => socket.emit('mod:stepDown')));
    }
  }

  // Roles setup (moderator only)
  renderRolesCard();

  // Players
  $('playerCount').textContent = state.users.length;
  const pl = $('playerList');
  pl.innerHTML = '';
  const mv = state.modView;
  const sorted = [...state.users].sort((a, b) => b.moderator - a.moderator);
  for (const u of sorted) {
    const isMe = key(u.name) === key(me);
    const li = el('li', isMe ? 'me' : '');
    const a = avatar(u.name, 'sm');
    a.append(el('span', 'dot'));
    const nameBox = el('div', 'pname');
    nameBox.append(el('span', '', u.name));
    let role = null;
    if (mv) role = mv.roles[key(u.name)];
    else if (isMe) role = state.me.role;
    else if (state.me.wolfmates?.some((n) => key(n) === key(u.name))) role = state.me.packRoles?.[key(u.name)] || 'werewolf';
    if (role && ROLE[role]) {
      const rt = roleLabel('role-tag', role, ROLE[role].label);
      rt.style.setProperty('--rc', ROLE[role].color);
      nameBox.append(rt);
    } else if (mv && !u.moderator) nameBox.append(el('span', 'role-tag none', 'no role'));
    li.append(a, nameBox);
    if (isMe) li.append(el('span', 'tag you', 'you'));
    if (u.bot) li.append(el('span', 'tag bot', '🤖 bot'));
    if (u.moderator) li.append(el('span', 'tag mod', 'mod'));
    const isDead = state.dead?.includes(key(u.name));
    if (isDead) li.append(el('span', 'tag dead', '💀 dead'));
    else if (u.muted) li.append(el('span', 'tag muted', 'muted'));
    if (mv && !u.moderator) {
      const isProt = mv.protected.includes(key(u.name));
      if (isProt) li.append(el('span', 'tag prot', '🛡️ protected'));
      const pb = el('button', 'protect-btn' + (isProt ? ' on' : ''), '🛡️');
      pb.type = 'button';
      pb.title = isProt ? `Remove protection from ${u.name}` : `Mark ${u.name} as protected`;
      pb.onclick = () => socket.emit('protect:toggle', u.name);
      const kb = el('button', 'kick-btn', '✕');
      kb.type = 'button';
      kb.title = `Kick ${u.name}`;
      kb.setAttribute('aria-label', `Kick ${u.name}`);
      kb.onclick = () => confirmKick(u.name);
      const db = el('button', 'kill-btn' + (isDead ? ' on' : ''), isDead ? '✨' : '💀');
      db.type = 'button';
      db.title = isDead ? `Bring ${u.name} back to life` : `Mark ${u.name} as dead`;
      db.onclick = () => confirmDeath(u.name, isDead);
      li.append(pb, db, kb);
    }
    pl.append(li);
  }

  // Vote to wipe: one button with a counter. The button fills up as votes come in.
  const wb = $('wipeBox');
  const n = state.wipe.votes;
  const need = state.wipe.needed;
  const voted = !amMod() && state.me.wiped;
  const sig = JSON.stringify([n, need, voted, amMod()]);
  if (wb.dataset.sig !== sig) {
    wb.dataset.sig = sig;
    wb.innerHTML = '';
    const modNow = amMod() && need === 0;
    const b = el('button', 'wipe-btn' + (voted ? ' voted' : '') + (amMod() && !modNow ? ' passive' : ''));
    b.type = 'button';
    b.style.setProperty('--fill', (100 * n) / Math.max(need, 1) + '%');
    b.title = amMod()
      ? modNow ? 'No players are here, so you can wipe straight away.' : "Wipes all chats, roles and mutes. Players vote; you don't need to."
      : 'Wipes all chats, roles and mutes for a new game. It happens when every player has voted. Tap again to take your vote back.';
    b.append(el('span', 'wipe-label', modNow ? '🧹 Wipe now' : voted ? '✓ Voted to wipe' : '🧹 Vote to wipe'));
    if (!modNow) b.append(el('span', 'wipe-count', `${n}/${need}`));
    if (!amMod() || modNow) b.onclick = () => socket.emit('wipe:vote');
    else b.disabled = true;
    wb.append(b);
  }
}

// ---------- Messages ----------
function currentMessages() {
  if (channel === 'lobby') return lobbyMsgs;
  // Players: the moderator chat and the AI helper's answers, in time order.
  if (channel === 'mod') {
    const [chat, ai, asker] = amMod() ? [modThreads[selectedThread] || [], aiThreads[selectedThread] || [], displayName(selectedThread || '')] : [myThread, aiMsgs, me];
    return [...chat, ...ai.map((m) => aiView(m, asker))].sort((a, b) => a.ts - b.ts);
  }
  if (channel === 'wolf') return wolfMsgs || [];
  return [];
}

function emptyState(icon, title, text) {
  const d = el('div', 'empty-state');
  d.append(el('div', 'big', icon), el('b', '', title), el('div', '', text));
  return d;
}

function renderMessages() {
  const box = $('messages');
  box.style.scrollBehavior = 'auto';
  box.innerHTML = '';
  lastRendered = null;
  const list = currentMessages();
  if (list.length === 0) {
    if (channel === 'mod') {
      if (amMod()) {
        box.append(
          selectedThread
            ? emptyState('💬', `No messages with ${displayName(selectedThread)} yet`, 'Send a private message or give them a role above.')
            : emptyState('🛡️', 'Your inbox is empty', 'Players who join will show up here.')
        );
      } else box.append(emptyState('🤫', 'Just you and the moderator', 'Nobody else can see what you write here. Switch on 🤖 AI to ask the AI helper about the rules or your role.'));
    } else if (channel === 'lobby') box.append(emptyState('👋', 'The lobby is quiet', dkMode() ? 'Say hello to Gotham!' : 'Say hello to the village!'));
    else if (dkMode()) box.append(emptyState('🎡', 'Amusement Mile is quiet', "The rides are rusting and the lights are dead, but at night Gotham's villains gather here to plan their next move."));
    else box.append(emptyState('🐺', 'The den is quiet', 'At night, the werewolves can plan their target here before telling the moderator.'));
    return;
  }
  for (const m of list) appendMessage(m, false);
  box.scrollTop = box.scrollHeight;
  requestAnimationFrame(() => (box.style.scrollBehavior = ''));
}

function appendMessage(m, live = true) {
  const box = $('messages');
  const empty = box.querySelector('.empty-state');
  if (empty) empty.remove();
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  let node;
  if (m.clue) {
    // The note itself is pinned top right; the chat just says it was found.
    const c = m.clue;
    node = el('div', 'msg-system clue-note', c.kind === 'interrogate' ? `🦇 Batman exposed ${c.about} as a villain — pinned top right` : c.kind === 'card' ? `🃏 A calling card was found with ${c.about} — pinned top right` : `📜 ${c.about}'s manifesto was revealed — pinned top right`);
    node.onclick = () => showClue(c, false);
    lastRendered = null;
  } else if (m.system) {
    node = el('div', 'msg-system', m.text);
    lastRendered = null;
  } else {
    const mine = key(m.from) === key(me);
    const cont = lastRendered && key(lastRendered.from) === key(m.from) && m.ts - lastRendered.ts < 3 * 60 * 1000 && !m.role;
    node = el('div', 'msg-row' + (mine ? ' me' : '') + (cont ? ' cont' : ''));
    node.append(avatar(m.from, 'sm'));
    const body = el('div', 'msg-body');
    if (!cont) {
      const meta = el('div', 'msg-meta');
      meta.append(el('span', 'author' + (m.moderator ? ' mod' : ''), mine ? 'You' : m.from + (m.moderator ? ' · moderator' : '')));
      meta.append(el('span', '', timeOf(m.ts)));
      body.append(meta);
    }
    const bubble = el('div', 'bubble' + (m.moderator && !mine ? ' modb' : ''));
    if (m.role) {
      const r = el('div', 'role-msg');
      const art = el('div', 'art');
      art.innerHTML = ART[m.role];
      const info = ROLE[m.role] || { icon: '', label: m.role };
      r.append(art, el('div', '', `Secret role: ${info.label}`));
      bubble.append(r);
    } else if (m.action) {
      const r = el('div', 'role-msg action-msg');
      const art = el('div', 'art');
      const role = m.action.kind === 'kill' ? (knownRole(m.from) || 'werewolf') : m.action.kind === 'poison' ? 'ivy' : m.action.kind === 'heal' ? 'doctor' : 'detective';
      art.innerHTML = ART[role] || '';
      const txt = el('div');
      const status = m.action.locked ? ' · 🔒 locked in' : m.action.changes ? ` · changed ${m.action.changes}×` : '';
      txt.append(el('div', 'check-kicker', `🌙 Night action · ${ACTION_TEXT[m.action.kind].noun}${status}`));
      if (m.action.locked) bubble.classList.add('locked');
      const line = el('div', 'check-line');
      if (m.action.target) line.append(el('b', '', m.from), document.createTextNode(` chose to ${ACTION_TEXT[m.action.kind].verb} `), el('b', 'action-target ' + m.action.kind, m.action.target));
      else if (m.action.skip) line.append(el('b', '', m.from), document.createTextNode(' chose to kill '), el('b', 'action-target kill', 'nobody'), document.createTextNode(' tonight'));
      else line.append(el('b', '', m.from), document.createTextNode(m.action.locked ? ' chose nobody' : ' has not chosen yet'));
      txt.append(line);
      r.append(art, txt);
      bubble.append(r);
      bubble.classList.add('check-bubble');
    } else if (m.check) {
      const wolf = m.check.result === 'wolf';
      const r = el('div', 'role-msg check-msg');
      const art = el('div', 'art');
      art.innerHTML = ART[wolf ? 'werewolf' : 'civilian'];
      const txt = el('div');
      txt.append(el('div', 'check-kicker', '🔍 Investigation result'));
      const line = el('div', 'check-line');
      const lbl = m.check.label || (wolf ? 'Wolf' : 'Civilian');
      line.append(el('b', '', m.check.target), document.createTextNode(' is '), el('b', 'check-verdict ' + (wolf ? 'wolf' : 'civ'), lbl === 'Killer' ? 'the Killer' : 'a ' + lbl));
      txt.append(line);
      r.append(art, txt);
      bubble.append(r);
      bubble.classList.add('check-bubble');
    } else if (m.ai) {
      bubble.classList.add('ai-bubble');
      if (m.ai.role === 'user') bubble.classList.add('ai-question');
      if (m.ai.error) bubble.classList.add('ai-error');
      if (m.ai.fixed) bubble.classList.add('ai-fixed');
      if (m.ai.pending && !m.text) {
        bubble.classList.add('ai-wait');
        bubble.append(el('span', 'ai-dots', ''), el('span', '', m.ai.pending === 'waiting' ? 'Waiting in line…' : 'Thinking…'));
      } else bubble.textContent = m.text;
    } else bubble.textContent = m.text;
    bubble.title = timeOf(m.ts);
    body.append(bubble);
    node.append(body);
    lastRendered = { from: m.from, ts: m.ts };
  }
  if (m.id != null) node.dataset.mid = m.id;
  if (!live) node.style.animation = 'none';
  box.append(node);
  if (live && (nearBottom || key(m.from || '') === key(me))) box.scrollTop = box.scrollHeight;
}

$('randomizeBtn').onclick = () => {
  const assigned = Object.keys(state.modView?.roles || {}).length;
  if (!assigned) return socket.emit('roles:randomize');
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = '<div style="font-size:4rem;line-height:140px">🎲</div>';
    card.append(art);
    card.append(el('h2', '', 'Hand out new roles?'));
    card.append(el('p', '', 'Every player gets a new random role, and protections are cleared.'));
    const actions = el('div', 'actions');
    actions.append(
      btn('btn-ghost', 'Cancel', closeModal),
      btn('btn-primary', '🎲 Shuffle roles', () => {
        socket.emit('roles:randomize');
        closeModal();
      })
    );
    card.append(actions);
  });
};

// ---------- Role-themed screen effects ----------
// Each player sees a background that matches their own secret role. The moderator sees the plain look.
let fxRole = undefined;
function rnd(a, b) {
  return a + Math.random() * (b - a);
}
// The new family roles borrow the closest existing screen theme.
const THEME_FOR = { officer: 'detective', mother: 'civilian', father: 'civilian', son: 'civilian' };
function renderRoleFx() {
  let raw = !state || amMod() ? null : state.me.role || null;
  // The Dark Knight: all of Gotham gets the Batman look; the villains get The Joker's.
  if (state && dkMode()) raw = DK_VILLAINS.includes(raw) ? 'joker' : 'batman';
  const role = THEME_FOR[raw] || raw;
  if (role === fxRole) return;
  fxRole = role;
  const fx = $('roleFx');
  const back = $('roleFxBack');
  back.innerHTML = '';
  $('chatFx').innerHTML = '';
  $('chatFx').className = 'chat-fx';
  document.body.className = document.body.className.replace(/\bfx-role-\S+/g, '').trim();
  fx.innerHTML = '';
  if (!role) return;
  document.body.classList.add('fx-role-' + role);
  // Edge decorations go in front; everything else goes behind the chat so it never covers text.
  const add = (cls, style = '', html = '', layer = fx) => {
    const d = el('div', cls);
    if (style) d.style.cssText = style;
    if (html) d.innerHTML = html;
    layer.append(d);
    return d;
  };
  const addBack = (cls, style, html) => add(cls, style, html, back);
  // Over the chat's background video, below the messages.
  const chatFx = $('chatFx');
  chatFx.innerHTML = '';
  chatFx.className = 'chat-fx ' + role;
  const addChat = (cls, style, html) => add(cls, style, html, chatFx);
  if (role === 'werewolf') {
    add('fx-vignette');
    add('fx-edge fx-top fangs');
    add('fx-edge fx-bottom fangs');
    for (let i = 0; i < 10; i++) {
      const left = rnd(1, 99).toFixed(1);
      const s = `left:${left}%;--w:${rnd(6, 14).toFixed(0)}px;--h:${rnd(24, 90).toFixed(0)}px;--d:${rnd(0, 6).toFixed(2)}s;--t:${rnd(5, 9).toFixed(1)}s`;
      add('drip', s);
      add('drop', s);
    }
  } else if (role === 'serialkiller') {
    add('fx-vignette');
    add('fx-edge fx-top blood-bar');
    add('fx-edge fx-bottom blood-bar');
    const spots = [
      'top:8%;left:calc(var(--left-w) - 70px);transform:rotate(10deg)',
      'top:38%;right:calc(var(--right-w) - 40px);transform:rotate(120deg) scale(0.8)',
      'bottom:10%;left:calc(var(--left-w) + 80px);transform:rotate(200deg) scale(0.7)',
      'bottom:14%;right:calc(var(--right-w) + 40px);transform:rotate(280deg) scale(1.1)',
    ];
    for (const c of spots) addBack('splat', c, ART_FX.splat);
    addBack('slashes', 'top:14%;right:calc(var(--right-w) + 30px)', ART_FX.slashes);
    addBack('slashes', 'bottom:30%;left:calc(var(--left-w) + 20px);transform:rotate(180deg) scale(0.8)', ART_FX.slashes);
    for (let i = 0; i < 6; i++) {
      const s = `left:${rnd(2, 98).toFixed(1)}%;--w:${rnd(5, 10).toFixed(0)}px;--h:${rnd(20, 70).toFixed(0)}px;--d:${rnd(0, 8).toFixed(2)}s;--t:${rnd(7, 11).toFixed(1)}s`;
      add('drip', s);
      add('drop', s);
    }
  } else if (role === 'doctor') {
    add('fx-glow');
    add('fx-edge fx-top crosses');
    add('fx-edge fx-bottom ecg', '', '<div class="ecg-line"></div>');
    for (let i = 0; i < 10; i++) {
      addBack('plus', `left:${rnd(2, 98).toFixed(1)}%;font-size:${rnd(14, 40).toFixed(0)}px;--d:${rnd(0, 14).toFixed(2)}s;--t:${rnd(10, 18).toFixed(1)}s`, '+');
    }
  } else if (role === 'detective') {
    add('fx-sirenglow');
    add('fx-edge fx-top sirens', '', '<div class="siren red"></div><div class="siren blue"></div>');
    add('fx-edge fx-bottom tape', '', `<div class="tape-text">${'POLICE LINE · DO NOT CROSS · '.repeat(16)}</div>`);
  } else if (role === 'batman') {
    // Dark Gotham: a bat signal in the sky, bats flying past, a gothic skyline.
    // A film filter over the scene: cold, dark colors, rain, searchlights and distant lightning.
    addChat('fx-grade');
    addChat('fx-lightning');
    addChat('fx-searchlight', 'left:18%;--a:-24deg;--b:14deg;--t:13s');
    addChat('fx-searchlight', 'left:74%;--a:20deg;--b:-18deg;--t:17s');
    addChat('fx-rain');
    addChat('fx-rain far');
    addChat('fx-vignette');
    add('fx-edge fx-top gotham-top');
    add('fx-edge fx-bottom gotham');
    addChat('bat-signal', '', ART_FX.batSignal);
    for (let i = 0; i < 9; i++) {
      addChat('fx-bat', `top:${rnd(6, 70).toFixed(1)}%;--s:${rnd(0.5, 1.3).toFixed(2)};--d:-${rnd(0, 20).toFixed(1)}s;--t:${rnd(9, 18).toFixed(1)}s;--dir:${Math.random() < 0.5 ? 1 : -1}`, ART_FX.bat);
    }
  } else if (role === 'vigilante') {
    // Dark and violent: a drifting scope, bullet holes, slashes of red.
    add('fx-vignette');
    add('fx-edge fx-top vig-bar');
    add('fx-edge fx-bottom vig-bar');
    addChat('scope', '', ART_FX.scope);
    for (let i = 0; i < 7; i++) {
      addChat('bullet-hole', `top:${rnd(8, 88).toFixed(1)}%;left:${rnd(3, 95).toFixed(1)}%;--s:${rnd(0.6, 1.3).toFixed(2)};--r:${rnd(0, 360).toFixed(0)}deg`, ART_FX.bulletHole);
    }
    addChat('slashes', 'top:18%;right:4%', ART_FX.slashes);
    addChat('slashes', 'bottom:20%;left:3%;transform:rotate(180deg) scale(0.8)', ART_FX.slashes);
  } else if (role === 'joker') {
    // A film filter over the scene: purple-and-green colors, neon laughter, falling cards, a flickering glow.
    addChat('fx-grade');
    addChat('fx-tint');
    addChat('fx-halftone');
    addChat('fx-spot', 'left:10%;--t:11s');
    addChat('fx-spot green', 'right:8%;--t:15s');
    addChat('fx-vignette');
    add('fx-edge fx-top joker-stripes');
    add('fx-edge fx-bottom joker-stripes');
    const colors = ['#a3e635', '#e879f9', '#4ade80', '#c084fc'];
    const n = isPhone() ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const word = ['HA HA', 'HA', 'HAHAHA', 'HA!', 'HEE HEE'][i % 5];
      addChat('haha', `top:${rnd(6, 86).toFixed(1)}%;left:${rnd(2, 84).toFixed(1)}%;--c:${colors[i % colors.length]};font-size:${(isPhone() ? rnd(14, 24) : rnd(20, 46)).toFixed(0)}px;--r:${rnd(-22, 22).toFixed(0)}deg;--d:-${rnd(0, 6).toFixed(1)}s;--t:${rnd(3.5, 6.5).toFixed(1)}s`, word);
    }
    // Playing cards tumbling down.
    for (let i = 0; i < (isPhone() ? 5 : 9); i++) {
      const suit = '♠♥♦♣'[i % 4];
      addChat('fx-card' + (i % 2 ? ' red' : ''), `left:${rnd(2, 96).toFixed(1)}%;--s:${rnd(0.6, 1.15).toFixed(2)};--r:${rnd(-40, 40).toFixed(0)}deg;--d:-${rnd(0, 16).toFixed(1)}s;--t:${rnd(11, 19).toFixed(1)}s`, `<span>${i % 3 === 0 ? 'J' : i % 3 === 1 ? 'A' : 'K'}</span><b>${suit}</b>`);
    }
  } else if (role === 'civilian') {
    add('fx-edge fx-bottom village');
    for (let i = 0; i < 5; i++) {
      addBack('cloud', `top:${rnd(2, 22).toFixed(1)}%;--s:${rnd(0.6, 1.4).toFixed(2)};--d:-${rnd(0, 60).toFixed(1)}s;--t:${rnd(50, 90).toFixed(0)}s`);
    }
    for (let i = 0; i < 12; i++) {
      addBack('firefly', `left:${rnd(2, 98).toFixed(1)}%;top:${rnd(40, 92).toFixed(1)}%;--d:-${rnd(0, 6).toFixed(1)}s;--t:${rnd(4, 8).toFixed(1)}s`);
    }
  }
}

const ART_FX = {
  bat: `<svg viewBox="0 0 40 16" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 C16 0 10 2 0 4 C6 6 8 10 10 14 C13 10 17 10 20 12 C23 10 27 10 30 14 C32 10 34 6 40 4 C30 2 24 0 20 6Z" fill="#05060c"/></svg>`,
  batSignal: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bsg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fde68a" stop-opacity="0.95"/><stop offset="70%" stop-color="#facc15" stop-opacity="0.55"/><stop offset="100%" stop-color="#facc15" stop-opacity="0"/></radialGradient></defs><ellipse cx="100" cy="100" rx="92" ry="70" fill="url(#bsg)"/><path transform="translate(40 72) scale(3)" d="M20 6 C16 0 10 2 0 4 C6 6 8 10 10 14 C13 10 17 10 20 12 C23 10 27 10 30 14 C32 10 34 6 40 4 C30 2 24 0 20 6Z" fill="#0b0d1a"/></svg>`,
  scope: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#ef4444" stroke-width="3"><circle cx="100" cy="100" r="80"/><circle cx="100" cy="100" r="40" stroke-width="2"/><path d="M100 4 V70 M100 130 V196 M4 100 H70 M130 100 H196"/></g><circle cx="100" cy="100" r="4" fill="#ef4444"/></svg>`,
  bulletHole: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"><g stroke="#d4d4d8" stroke-width="1.5" opacity="0.8"><path d="M30 30 L8 14 M30 30 L52 10 M30 30 L56 38 M30 30 L36 58 M30 30 L6 44 M30 30 L22 4"/></g><circle cx="30" cy="30" r="9" fill="#0a0a0a" stroke="#52525b" stroke-width="2"/><circle cx="30" cy="30" r="4" fill="#000"/></svg>`,
  splat: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><g fill="#8a0b12">
<path d="M100 40 C120 42 125 70 145 65 C165 60 170 85 150 98 C135 108 160 125 140 140 C122 152 110 132 96 150 C82 168 62 150 70 132 C76 118 48 120 50 100 C52 80 72 86 76 70 C80 52 84 38 100 40Z"/>
<circle cx="170" cy="40" r="9"/><circle cx="35" cy="60" r="7"/><circle cx="160" cy="165" r="11"/><circle cx="40" cy="170" r="6"/><circle cx="185" cy="110" r="5"/><circle cx="20" cy="115" r="4"/><circle cx="120" cy="185" r="5"/>
<path d="M145 65 L190 20 L150 75Z"/><path d="M70 132 L18 185 L80 140Z"/></g></svg>`,
  slashes: `<svg viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg"><g fill="#9b111e">
<path d="M20 10 L34 8 L120 190 L112 194Z"/><path d="M55 4 L68 4 L148 180 L140 186Z"/><path d="M0 50 L10 46 L80 196 L74 198Z"/></g></svg>`,
};

// ---------- Phase timer (counts up from the start of the current day or night) ----------
let clockOffset = 0;
function formatElapsed(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}
function tickPhaseTimer() {
  if (!state) return;
  // Before a game starts, the timer waits.
  // Day counter: the night belongs to the day before it (Day 1, Night 1, Day 2, …).
  const running = state.gameState === 'running';
  const day = running ? (state.nightNumber || 0) + (state.phase === 'night' ? 0 : 1) : 0;
  $('dayCount').classList.toggle('hidden', !running);
  if (running && $('dayCount').textContent !== `Day ${day}`) $('dayCount').textContent = `Day ${day}`;
  if (state.gameState !== 'running') {
    $('phaseTimerLabel').textContent = '⏳';
    if ($('phaseTimerTime').textContent !== 'Waiting') $('phaseTimerTime').textContent = 'Waiting';
    $('phaseTimer').classList.remove('night');
    return;
  }
  const night = state.phase === 'night';
  $('phaseTimerLabel').textContent = night ? '🌙 Night' : '☀️ Day';
  const text = formatElapsed(Date.now() + clockOffset - state.phaseStartedAt);
  if ($('phaseTimerTime').textContent !== text) $('phaseTimerTime').textContent = text;
  $('phaseTimer').classList.toggle('night', night);
}
setInterval(tickPhaseTimer, 250);

// ---------- Kick (moderator) ----------
function confirmKick(name) {
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = '<div style="font-size:4rem;line-height:140px">👢</div>';
    card.append(art);
    card.append(el('h2', '', `Kick ${name}?`));
    card.append(el('p', '', 'They are removed from the game and their role is cleared. They can join again with a name.'));
    const actions = el('div', 'actions');
    actions.append(
      btn('btn-ghost', 'Cancel', closeModal),
      btn('btn-danger', `Kick ${name}`, () => {
        socket.emit('mod:kick', name);
        closeModal();
      })
    );
    card.append(actions);
  });
}

// ---------- Night actions ----------
const ACTION_TEXT = {
  kill: { verb: 'kill', noun: 'Kill', title: 'Choose your victim', btn: 'btn-danger' },
  poison: { verb: 'poison', noun: 'Poison', title: 'Choose who to poison', btn: 'btn-success' },
  heal: { verb: 'heal', noun: 'Heal', title: 'Choose who to protect', btn: 'btn-success' },
  investigate: { verb: 'investigate', noun: 'Investigate', title: 'Choose who to investigate', btn: 'btn-primary' },
  vigil: { verb: 'kill', noun: 'Vigilante', title: 'Choose who to kill', btn: 'btn-danger' },
  interrogate: { verb: 'interrogate', noun: 'Interrogate', title: 'Interrogate someone (optional)', btn: 'btn-primary' },
};

// The player's own panel: pick a target at night.
function renderActionCard() {
  const card = $('actionCard');
  const a = !amMod() && state.me.action;
  card.classList.toggle('hidden', !a);
  if (!a) return;
  if (a.kind === 'arrest') return renderArrestCard(card, a);
  if (state.me.arrestedTonight && state.phase === 'night') {
    card.className = 'card action-card';
    card.dataset.sig = 'arrested';
    card.innerHTML = '';
    card.append(el('div', 'card-title', '🚔 Arrested'), el('p', 'hint', 'You were arrested today, so you cannot use your ability tonight.'));
    return;
  }
  const t = ACTION_TEXT[a.kind];
  const night = state.phase === 'night';
  const sig = JSON.stringify([a, night, amMuted()]);
  if (card.dataset.sig === sig) return; // nothing changed; keep it still
  card.dataset.sig = sig;
  card.className = 'card action-card ' + a.kind;
  card.innerHTML = '';
  const title = el('div', 'card-title');
  title.append(roleIcon(state.me.role), document.createTextNode(' Your night action'));
  card.append(title);
  if (amMuted()) {
    card.append(el('p', 'hint', 'You are muted and cannot act.'));
    return;
  }
  if (!night) {
    card.append(el('p', 'hint', a.target ? `Last night you chose to ${t.verb} ${a.target}.` : `At night you choose someone to ${t.verb}. The moderator is told who.`));
    return;
  }
  card.append(el('div', 'action-title', t.title));
  card.append(el('p', 'hint', a.skip ? 'You chose to kill nobody tonight. You can change it until morning.' : a.target ? `You chose ${a.target}. You can change it until morning.` : 'Only the moderator sees your choice.'));
  const list = el('div', 'target-list');
  for (const name of a.targets) {
    const b = el('button', 'target-btn' + (a.target === name ? ' on ' + a.kind : ''));
    b.type = 'button';
    b.append(avatar(name, 'sm'), el('span', 'tname', name + (key(name) === key(me) ? ' (you)' : '')));
    if (a.target === name) b.append(el('span', 'tag picked', '✓ ' + t.verb));
    b.onclick = () => socket.emit('night:choose', a.target === name ? null : name);
    list.append(b);
  }
  // Detective: players already investigated are shown but can't be picked again.
  for (const x of a.investigated || []) {
    const b = el('button', 'target-btn done');
    b.type = 'button';
    b.disabled = true;
    b.title = `You already investigated ${x.name}`;
    b.append(avatar(x.name, 'sm'), el('span', 'tname', x.name));
    const tone = x.label === 'Civilian' ? 'good' : x.label ? 'bad' : '';
    b.append(el('span', 'tag done-tag ' + tone, x.label ? `Already investigated: ${x.label}` : 'Already investigated (waiting)'));
    list.append(b);
  }
  if (!a.targets.length) list.append(el('p', 'hint', a.investigated?.length ? 'You have investigated everyone you can.' : 'There is nobody to choose.'));
  // The killer can also decide not to kill anyone tonight.
  if (a.kind === 'kill' || a.kind === 'vigil') {
    const nb = el('button', 'target-btn nobody' + (a.skip ? ' on kill' : ''));
    nb.type = 'button';
    nb.append(el('span', 'nobody-icon', '🚫'), el('span', 'tname', 'Kill nobody tonight'));
    if (a.skip) nb.append(el('span', 'tag picked', '✓ chosen'));
    nb.onclick = () => socket.emit('night:choose', a.skip ? null : '__nobody__');
    list.append(nb);
  }
  card.append(list);
  if (a.pack?.length) {
    const pack = el('div', 'pack');
    pack.append(el('div', 'pack-title', 'Your pack — everyone must pick the same player'));
    pack.append(el('div', 'pack-status ' + (a.agreed || a.agreedNobody ? 'ok' : 'no'), a.agreed ? `✓ The pack agrees on ${a.agreed}` : a.agreedNobody ? '✓ The pack agrees to kill nobody tonight' : '✗ Not agreed yet: nobody dies unless you all pick the same player'));
    for (const p of a.pack) pack.append(el('div', 'pack-row', `${p.name} → ${p.skip ? 'nobody' : p.target || 'not chosen yet'}`));
    card.append(pack);
  }
}

// The moderator's summary of tonight's choices.
function renderNightCard() {
  const card = $('nightCard');
  let list = amMod() && state.gameState === 'running' ? state.modView?.nightActions || [] : [];
  // By day, only show it if something actually happened last night.
  if (state.phase !== 'night' && !list.some((a) => a.target || a.skip)) list = [];
  card.classList.toggle('hidden', !list.length);
  if (!list.length) return;
  card.innerHTML = '';
  const night = state.phase === 'night';
  card.append(el('div', 'card-title', night ? '🌙 Tonight\'s choices' : '🌙 Last night\'s choices'));
  if (night && state.modView?.outcome) card.append(el('div', 'outcome', `At sunrise: ${state.modView.outcome}`));
  const order = { kill: 0, poison: 1, heal: 1, investigate: 2, vigil: 3, interrogate: 4 };
  for (const a of [...list].sort((x, y) => order[x.kind] - order[y.kind])) {
    const row = el('div', 'night-row' + (a.target || a.skip ? '' : ' waiting'));
    row.append(avatar(a.actor, 'sm'));
    const txt = el('div', 'night-text');
    txt.append(el('b', '', a.actor));
    txt.append(document.createTextNode(a.muted ? ' · muted' : a.skip ? ' → kills nobody tonight' : a.target ? ` → ${ACTION_TEXT[a.kind].verb} ` : ` · ${night ? 'choosing…' : 'chose nobody'}`));
    if (a.target && !a.muted) txt.append(el('b', 'action-target ' + a.kind, a.target));
    row.append(txt);
    card.append(row);
  }
}

// ---------- Calling cards, manifestos and clues ----------
$('cardNav').onclick = () => openNoteEditor('card');
$('manifestoNav').onclick = () => openNoteEditor('manifesto');
$('disguiseNav').onclick = () => openDisguisePicker();
// Clayface: choose the role The Batman sees when he investigates you.
function openDisguisePicker() {
  const d = state.me.disguise;
  if (!d) return;
  closeDrawers();
  openModal((card) => {
    card.classList.add('role-picker', 'disguise-picker');
    card.append(el('h2', '', '🎭 Your disguise'));
    card.append(el('p', 'hint', 'When The Batman investigates you, he sees this role instead of Clayface.'));
    const grid = el('div', 'disguise-grid');
    for (const r of d.options) {
      const b = el('button', 'rp-role disguise-tile' + (d.role === r ? ' on' : ''));
      b.type = 'button';
      b.append(roleIcon(r), el('span', '', ROLE[r].label));
      b.onclick = () => {
        socket.emit('clayface:disguise', r);
        closeModal();
      };
      grid.append(b);
    }
    card.append(grid);
    const actions = el('div', 'actions');
    actions.append(btn('btn-primary', 'Close', closeModal));
    card.append(actions);
  });
}

function openNoteEditor(kind) {
  closeDrawers();
  const isCard = kind === 'card';
  const max = isCard ? 100 : 200;
  const current = (isCard ? state.me.callingCard : state.me.manifesto) || '';
  const locked = !isCard && state.me.dead;
  openModal((card) => {
    card.classList.add('note-modal');
    const art = el('div', 'note-icon', isCard ? '🃏' : '📜');
    card.append(art);
    card.append(el('h2', '', isCard ? 'Your calling card' : 'Your manifesto'));
    card.append(
      el(
        'p',
        '',
        isCard
          ? 'Left next to each victim you pick at night. When day comes, everyone sees it in the clues bar.'
          : 'Your last words. Nobody sees them unless you die. Then they are revealed to everyone.'
      )
    );
    const ta = el('textarea', 'note-input');
    ta.maxLength = max;
    ta.rows = isCard ? 3 : 5;
    ta.value = current;
    ta.disabled = locked;
    ta.placeholder = isCard ? 'e.g. "One by one, the village falls silent."' : 'e.g. "I was innocent. Watch Bob closely."';
    const count = el('div', 'note-count');
    const upd = () => (count.textContent = `${ta.value.length} / ${max}`);
    ta.addEventListener('input', upd);
    upd();
    card.append(ta, count);
    if (locked) card.append(el('p', 'hint', 'You are dead, so your manifesto can no longer change.'));
    const actions = el('div', 'actions');
    actions.append(btn('btn-ghost', locked ? 'Close' : 'Cancel', closeModal));
    if (!locked) {
      actions.append(
        btn('btn-primary', 'Save', () => {
          socket.emit(isCard ? 'card:set' : 'manifesto:set', ta.value);
          closeModal();
        })
      );
    }
    card.append(actions);
    setTimeout(() => ta.focus(), 60);
  });
}

// A clue as a card: used in the chat, the clues bar pop-up and the reveal pop-up.
function clueCard(clue, inChat) {
  if (clue.kind === 'check') {
    const d = el('div', 'clue-card check ' + clue.result);
    d.append(el('div', 'clue-kicker', `🔒 Private investigation · only you can see this`));
    d.append(el('div', 'clue-text', clue.text));
    return d;
  }
  const isCard = clue.kind === 'card';
  const d = el('div', 'clue-card ' + clue.kind + (inChat ? ' in-chat' : ''));
  d.append(el('div', 'clue-kicker', clue.kind === 'interrogate' ? '🦇 Batman\'s interrogation' : isCard ? `🃏 Calling card · found with ${clue.about}` : `📜 Manifesto of ${clue.about}`));
  d.append(el('div', 'clue-text', clue.text));
  if (inChat) d.onclick = () => showClue(clue, false);
  return d;
}

const clueQueue = [];
socket.on('clue:reveal', (clue) => {
  clueQueue.push(clue);
  showNextClue();
});
function showNextClue() {
  if (!clueQueue.length || !$('modal').classList.contains('hidden')) return;
  const next = clueQueue.shift();
  if (next.__result) next.__result();
  else showClue(next, true);
}
function showClue(clue, fresh) {
  if (clue.kind === 'check') {
    return openModal((card) => {
      const art = el('div', 'art role');
      // The Dark Knight: The Batman's intel names a role, so show that role's picture.
      const seen = dkMode() && Object.keys(ROLE).find((k) => ROLE[k].label === clue.label && (DK_SKIN[k] || DK_VILLAINS.includes(k)));
      art.innerHTML = ART[seen || (clue.result === 'wolf' ? (clue.label === 'Killer' ? 'serialkiller' : 'werewolf') : 'civilian')];
      card.append(art);
      card.append(el('h2', '', fresh ? 'Investigation result' : 'Your investigation'));
      card.append(clueCard(clue, false));
      card.append(el('p', 'hint', 'Saved in your clues bar. Nobody else can see it.'));
      const actions = el('div', 'actions');
      actions.append(btn('btn-primary', 'Close', closeModal));
      card.append(actions);
    });
  }
  openModal((card) => {
    card.classList.add('note-modal');
    card.append(el('div', 'note-icon', clue.kind === 'interrogate' ? '🦇' : clue.kind === 'card' ? '🃏' : '📜'));
    card.append(el('h2', '', clue.kind === 'interrogate' ? `${clue.about} is a villain!` : clue.kind === 'card' ? (fresh ? 'A calling card was found' : 'Calling card') : `${clue.about}'s manifesto`));
    if (clue.kind === 'card') card.append(el('p', '', `It was left next to ${clue.about}.`));
    card.append(clueCard(clue, false));
    const actions = el('div', 'actions');
    actions.append(btn('btn-primary', 'Close', closeModal));
    card.append(actions);
  });
}

// Revealed notes as tiles pinned to the top-right of the chat. Click a tile to read it in full.
let tilesCollapsed = false;
try {
  tilesCollapsed = localStorage.getItem('tilesCollapsed') === '1';
} catch {}
function renderCluesBar() {
  const box = $('clueTiles');
  // Public clues plus this player's private investigation results, newest first.
  // On phones the private investigation results live in the Results window instead.
  const mine = isPhone() ? [] : state.me.privateClues || [];
  const list = [...(state.clues || []), ...mine].sort((a, b) => b.ts - a.ts);
  const show = (channel === 'lobby' || (channel === 'mod' && !amMod())) && list.length > 0;
  box.classList.toggle('hidden', !show);
  if (!show) return;
  // Sit just below whatever banners are showing above the messages.
  // On phones they stack under the players panel in the top right.
  const pp = $('phonePlayers');
  box.style.top = (isPhone() ? pp.offsetTop + pp.offsetHeight + 8 : $('messages').offsetTop + 10) + 'px';
  const sig = list.map((c) => c.id).join(',') + '|' + tilesCollapsed;
  if (box.dataset.sig === sig) return;
  const known = new Set((box.dataset.sig || '').split('|')[0].split(','));
  box.dataset.sig = sig;
  box.innerHTML = '';
  box.classList.toggle('collapsed', tilesCollapsed);
  const head = el('button', 'tiles-head', `🔎 Clues (${list.length}) ${tilesCollapsed ? '▸' : '▾'}`);
  head.type = 'button';
  head.title = tilesCollapsed ? 'Show clues' : 'Hide clues';
  head.onclick = () => {
    tilesCollapsed = !tilesCollapsed;
    try {
      localStorage.setItem('tilesCollapsed', tilesCollapsed ? '1' : '0');
    } catch {}
    renderCluesBar();
  };
  box.append(head);
  if (tilesCollapsed) return;
  const grid = el('div', 'tiles');
  for (const c of list) {
    const t = el('button', 'tile ' + c.kind + (c.kind === 'check' ? ' ' + c.result : '') + (known.has(String(c.id)) ? '' : ' new'));
    t.type = 'button';
    const kicker = c.kind === 'interrogate' ? `🦇 Interrogation · ${c.about}` : c.kind === 'card' ? `🃏 Calling card · ${c.about}` : c.kind === 'check' ? `🔒 Your investigation` : `📜 ${c.about}`;
    t.append(el('div', 'tile-kicker', kicker), el('div', 'tile-text', c.text));
    t.title = 'Click to read';
    t.onclick = () => showClue(c, false);
    grid.append(t);
  }
  box.append(grid);
}

function confirmDeath(name, isDead) {
  openModal((card) => {
    card.append(el('div', 'note-icon', isDead ? '✨' : '💀'));
    card.append(el('h2', '', isDead ? `Bring ${name} back?` : `Mark ${name} as dead?`));
    card.append(
      el(
        'p',
        '',
        isDead
          ? 'They can talk in the chat again.'
          : state.phase === 'night'
            ? 'It is night, so the death (and any manifesto or calling card) is revealed when day starts.'
            : 'Everyone is told now, and their manifesto (and a calling card, if the killer picked them) is revealed.'
      )
    );
    const actions = el('div', 'actions');
    actions.append(
      btn('btn-ghost', 'Cancel', closeModal),
      btn(isDead ? 'btn-success' : 'btn-danger', isDead ? 'Bring back' : '💀 Mark dead', () => {
        socket.emit('mod:kill', name);
        closeModal();
      })
    );
    card.append(actions);
  });
}

// ---------- Sunrise result ----------
socket.on('night:result', ({ victims, lines = [], killer = 'night' }) => {
  const show = () =>
    openModal((card) => {
      card.append(el('div', 'note-icon', victims.length ? '☠️' : '🌅'));
      if (victims.length) {
        card.append(el('h2', '', victims.length === 1 ? `${victims[0]} was killed in the night` : `${victims.join(' and ')} were killed in the night`));
        card.append(killVideo(killer));
        for (const l of lines) card.append(el('p', 'death-line', l));
        card.append(el('p', 'hint', victims.some((v) => key(v) === key(me)) ? 'You are dead. You can only talk to the moderator now.' : (dkMode() ? 'They can no longer speak in Gotham.' : 'They can no longer speak in the village.')));
      } else {
        card.append(el('h2', '', 'No victim'));
        card.append(el('p', '', dkMode() ? 'Gotham wakes up. Nobody died last night.' : 'The village wakes up. Nobody died last night.'));
      }
      const actions = el('div', 'actions');
      actions.append(btn('btn-primary', 'Close', closeModal));
      card.append(actions);
    });
  // Let any open pop-up finish first; clue reveals queue up behind this one.
  if ($('modal').classList.contains('hidden')) show();
  else clueQueue.unshift({ __result: show });
});

// ---------- Moderator overview: alive, dead, living roles ----------
function isDeadName(n) {
  return state.dead?.includes(key(n)) || state.users.some((u) => key(u.name) === key(n) && u.muted);
}
function renderModOverview() {
  const box = $('modOverview');
  const show = amMod() && channel === 'mod';
  box.classList.toggle('hidden', !show);
  // Killer vs Wolf label on the answer button.
  const single = state.modView?.wolfCount === 1;
  $('checkWolfLabel').textContent = single ? 'Killer' : 'Wolf';
  $('checkWolfImg').src = `img/roles/sm/${single ? 'serialkiller' : 'werewolf'}.webp`;
  if (!show) return;
  const roles = state.modView?.roles || {};
  const players = state.users.filter((u) => !u.moderator);
  const alive = players.filter((u) => !isDeadName(u.name));
  const dead = players.filter((u) => isDeadName(u.name));
  const sig = JSON.stringify([alive.map((u) => u.name), dead.map((u) => u.name), roles]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  const panel = (title, cls, items) => {
    const p = el('div', 'ov-box ' + cls);
    p.append(el('div', 'ov-title', `${title} (${items.length})`));
    const list = el('div', 'ov-list');
    if (!items.length) list.append(el('span', 'ov-empty', 'Nobody'));
    for (const it of items) list.append(it);
    p.append(list);
    return p;
  };
  const chip = (name) => {
    const c = el('span', 'ov-chip');
    const r = roles[key(name)];
    if (r) c.append(roleIcon(r));
    c.append(document.createTextNode(' ' + name));
    return c;
  };
  const counts = {};
  for (const u of alive) {
    const r = roles[key(u.name)];
    if (r) counts[r] = (counts[r] || 0) + 1;
  }
  const order = ['dkjoker', 'harley', 'ivy', 'clayface', 'werewolf', 'serialkiller', 'joker', 'doctor', 'detective', 'officer', 'vigilante', 'batman', 'mother', 'father', 'son', 'civilian'];
  const roleItems = order.filter((r) => counts[r]).map((r) => roleLabel('ov-chip role', r, `${counts[r]} × ${ROLE[r].label}`));
  box.append(panel('🟢 Alive', 'alive', alive.map((u) => chip(u.name))), panel('💀 Dead', 'dead', dead.map((u) => chip(u.name))), panel('🎭 Roles still alive', 'roles', roleItems));
}

window.addEventListener('resize', () => state && renderCluesBar());

// ---------- Start menu (before a game) ----------
let startMinimized = false;
let randomizeOnStart = true;
socket.on('game:started', () => {
  startMinimized = false;
  toast('🎮 The game has started!');
});
function renderStartScreen() {
  const box = $('startScreen');
  const show = state.gameState !== 'running' && channel === 'lobby';
  box.classList.toggle('hidden', !show);
  // On phones the open start menu gets the whole chat area (the floating panels step aside).
  document.body.classList.toggle('start-open', show && !startMinimized);
  if (!show) return;
  const players = state.users.filter((u) => !u.moderator);
  const cfg = state.modView?.roleConfig;
  const assigning = state.gameState === 'assigning';
  const sig = JSON.stringify([startMinimized, randomizeOnStart, state.users, state.moderator, amMod(), cfg, state.gameState, assigning && state.modView?.roles]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  box.classList.toggle('minimized', startMinimized);
  if (startMinimized) {
    const label = assigning ? (amMod() ? 'Hand out roles' : 'Waiting for roles') : amMod() ? 'Start menu' : 'Waiting for the game';
    const b = btn('btn-primary', `🎮 ${label} (${players.length} joined) ▸`, () => {
      startMinimized = false;
      renderStartScreen();
    });
    box.append(b);
    return;
  }
  const card = el('div', 'start-card');
  const min = el('button', 'icon-btn start-min', '—');
  min.type = 'button';
  min.title = 'Minimize so you can chat';
  min.onclick = () => {
    startMinimized = true;
    renderStartScreen();
  };
  const logo = el('div', 'start-logo');
  logo.innerHTML = ART.night;
  if (dkMode()) logo.innerHTML = ART.dkbatman;
  card.append(min, logo, el('h2', '', dkMode() ? 'The Dark Knight' : 'Village Chat'));
  if (assigning) {
    renderAssigning(card, players);
    box.append(card);
    return;
  }
  card.append(el('p', 'start-sub', amMod() ? 'Wait for everyone to join, then start a new game.' : state.moderator ? `Waiting for ${state.moderator} to start the game…` : 'Waiting for someone to become the moderator…'));
  const who = el('div', 'start-players');
  who.append(el('div', 'start-label', `Players joined (${players.length})`));
  const chips = el('div', 'start-chips');
  if (!players.length) chips.append(el('span', 'hint', 'Nobody yet. Share the link!'));
  for (const u of players) {
    const c = el('span', 'start-chip');
    c.append(avatar(u.name, 'sm'), document.createTextNode(u.name + (u.bot ? ' 🤖' : '')));
    chips.append(c);
  }
  who.append(chips);
  card.append(who);
  // Game mode: the moderator picks it before the game starts; everyone sees which one it is.
  const modeRow = el('div', 'start-mode');
  modeRow.append(el('div', 'start-label', 'Game mode'));
  if (amMod()) {
    const seg = el('div', 'segmented');
    for (const [m, t] of [['classic', '🏡 Original'], ['darkknight', '🦇 The Dark Knight']]) {
      const b = el('button', (state.mode || 'classic') === m ? 'on' : '', t);
      b.type = 'button';
      b.onclick = () => socket.emit('mode:set', m);
      seg.append(b);
    }
    modeRow.append(seg);
  } else modeRow.append(el('div', 'start-mode-name', dkMode() ? '🦇 The Dark Knight' : '🏡 Original'));
  card.append(modeRow);
  if (amMod() && cfg) {
    const fam = !dkMode() && familyOn(cfg, players.length);
    const special = dkMode() ? dkSpecial(cfg) : cfg.werewolf + cfg.doctor + cfg.detective + cfg.officer + (fam ? 3 : 0);
    const setup = el('div', 'start-setup');
    const civ = Math.max(players.length - special, 0);
    const parts = dkMode() ? [
      ['dkjoker', 'The Joker'],
      ...['harley', 'ivy', 'clayface'].filter((r) => cfg[r]).map((r) => [r, ROLE[r].label]),
      ...(cfg.doctor ? [['doctor', `${cfg.doctor > 1 ? cfg.doctor + ' × ' : ''}Thomas Wayne`]] : []),
      ...(cfg.detective ? [['detective', `${cfg.detective > 1 ? cfg.detective + ' × ' : ''}The Batman`]] : []),
      ...(cfg.officer ? [['officer', `${cfg.officer > 1 ? cfg.officer + ' × ' : ''}Commissioner Gordon`]] : []),
      ['civilian', `${civ} Citizen${civ === 1 ? '' : 's'}`],
    ] : [
      ...(fam ? [['mother', 'Mother'], ['father', 'Father'], ['son', 'Son']] : []),
      [cfg.werewolf === 1 ? 'serialkiller' : 'werewolf', cfg.werewolf === 1 ? '1 Serial Killer' : `${cfg.werewolf} Werewolves`],
      ['doctor', `${cfg.doctor} Doctor${cfg.doctor === 1 ? '' : 's'}`],
      ['detective', `${cfg.detective} Detective${cfg.detective === 1 ? '' : 's'}`],
      ...(cfg.officer ? [['officer', `${cfg.officer} Officer${cfg.officer === 1 ? '' : 's'}`]] : []),
      ['civilian', `${civ} Civilian${civ === 1 ? '' : 's'}`],
    ];
    const row = el('div', 'start-roles');
    for (const [r, t] of parts) row.append(roleLabel('start-role', r, t));
    setup.append(el('div', 'start-label', 'Roles (change them in the right panel)'), row);
    const lab = el('label', 'start-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = randomizeOnStart;
    cb.onchange = () => {
      randomizeOnStart = cb.checked;
      renderStartScreen();
    };
    lab.append(cb, document.createTextNode(' Hand out random roles when the game starts'));
    setup.append(lab);
    card.append(setup);
    const tooMany = randomizeOnStart && special > players.length;
    const noKiller = !dkMode() && randomizeOnStart && cfg.werewolf < 1;
    if (tooMany) card.append(el('p', 'start-warn', `You picked ${special} special roles but only ${players.length} player${players.length === 1 ? ' has' : 's have'} joined.`));
    if (noKiller) card.append(el('p', 'start-warn', 'There needs to be at least one killer. Add a Werewolf in the right panel.'));
    if (!randomizeOnStart) card.append(el('p', 'hint', 'Next you give each player a role yourself. The game starts when you are done.'));
    const go = btn('btn-primary btn-lg btn-block', randomizeOnStart ? '🎮 New game' : '🎮 New game: hand out roles', () => socket.emit('game:start', { randomize: randomizeOnStart }));
    go.disabled = players.length === 0 || tooMany || noKiller;
    card.append(go);
  } else if (!state.moderator) {
    card.append(btn('btn-primary btn-block', '🛡️ Become moderator', () => socket.emit('mod:claim')));
  } else {
    card.append(el('p', 'hint', 'You can chat while you wait. New players can also join after the game has started.'));
  }
  box.append(card);
}

function renderEndGame() {
  let b = $('endGameBtn');
  if (!b) {
    b = btn('btn-ghost btn-block', '⏹ End game', () =>
      openModal((card) => {
        card.append(el('div', 'note-icon', '⏹'));
        card.append(el('h2', '', 'End the game?'));
        card.append(el('p', '', 'All chats, roles and clues are wiped and everyone goes back to the start menu.'));
        const actions = el('div', 'actions');
        actions.append(
          btn('btn-ghost', 'Cancel', closeModal),
          btn('btn-danger', 'End game', () => {
            socket.emit('game:end');
            closeModal();
          })
        );
        card.append(actions);
      })
    );
    b.id = 'endGameBtn';
    $('modTools').append(b);
  }
  b.classList.toggle('hidden', state.gameState !== 'running');
  if (!$('kickAllBtn')) {
    const k = btn('btn-ghost btn-block kick-all', '🔄 Kick all & reset', () =>
      openModal((card) => {
        card.append(el('div', 'note-icon', '🔄'));
        card.append(el('h2', '', 'Kick everyone and reset?'));
        card.append(el('p', '', 'Every player and bot is sent back to the join screen. All chats, roles, clues and character picks are cleared. Everyone joins again and picks a character.'));
        const actions = el('div', 'actions');
        actions.append(
          btn('btn-ghost', 'Cancel', closeModal),
          btn('btn-danger', 'Kick all & reset', () => {
            socket.emit('mod:kickAll');
            closeModal();
          })
        );
        card.append(actions);
      })
    );
    k.id = 'kickAllBtn';
    $('modTools').append(k);
  }
}

// ---------- Death animations ----------
// 'night' = the werewolf attack, 'killer' = the Serial Killer, 'vote' = the village's verdict,
// 'wolfdeath' = a werewolf shot with a silver bullet, 'found' = an detective finds the body. Plays once and stops on the last frame.
const KILL_VIDEO_VERSION = 1;
function killVideo(kind) {
  const wrap = el('div', 'kill-video');
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.preload = 'auto';
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.poster = `video/kill-${kind}-poster.jpg?v=${KILL_VIDEO_VERSION}`;
  for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
    const src = document.createElement('source');
    src.src = `video/kill-${kind}.${ext}?v=${KILL_VIDEO_VERSION}`;
    src.type = type;
    v.append(src);
  }
  const replay = el('button', 'kill-replay', '↻ Replay');
  replay.type = 'button';
  replay.onclick = () => {
    v.currentTime = 0;
    v.play().catch(() => {});
  };
  v.addEventListener('ended', () => wrap.classList.add('done'));
  v.addEventListener('play', () => wrap.classList.remove('done'));
  wrap.append(v, replay);
  setTimeout(() => v.play().catch(() => {}), 50);
  return wrap;
}
// Preload both so they start right away.
for (const k of ['night', 'killer', 'vote', 'wolfdeath', 'found', 'batman']) {
  const l = document.createElement('link');
  l.rel = 'preload';
  l.as = 'video';
  l.href = `video/kill-${k}.mp4?v=${KILL_VIDEO_VERSION}`;
  document.head.append(l);
}

// A death the moderator marks during the day.
socket.on('death:shown', ({ victim, wolf }) => {
  const show = () =>
    openModal((card) => {
      card.append(el('div', 'note-icon', '☠️'));
      card.append(el('h2', '', `${victim} has died`));
      if (wolf) card.append(killVideo('wolfdeath'));
      card.append(el('p', 'hint', key(victim) === key(me) ? 'You are dead. You can only talk to the moderator now.' : (dkMode() ? 'They can no longer speak in Gotham.' : 'They can no longer speak in the village.')));
      const actions = el('div', 'actions');
      actions.append(btn('btn-primary', 'Close', closeModal));
      card.append(actions);
    });
  if ($('modal').classList.contains('hidden')) show();
  else clueQueue.unshift({ __result: show });
});

// ---------- Ability results ----------
const ABILITY_ICON = { interrogate: '🦇', arrest: '🚔', arrested: '🚔',  kill: '🗡️', heal: '🩺', investigate: '🔍', vigil: '🎯', clue: '🦇' };
socket.on('ability:result', (e) => {
  freshAbilityId = e.id;
  // Show it as a pop-up after the morning news.
  const show = () =>
    openModal((card) => {
      const art = el('div', 'art role');
      art.innerHTML = ART[state?.me?.role] || '';
      card.append(art);
      card.append(el('div', 'role-kicker', `Night ${e.night} · your ability result`));
      card.append(el('h2', 'ability-text ' + (e.tone || ''), e.text));
      card.append(el('p', 'hint', 'Saved in the Ability results box on the left.'));
      const actions = el('div', 'actions');
      actions.append(btn('btn-primary', 'Close', closeModal));
      card.append(actions);
    });
  clueQueue.push({ __result: show });
  showNextClue();
});

// ---------- Left sidebar box ----------
// Players with an ability see their own results; the moderator sees every ability player.
let freshAbilityId = null;
const ABILITY_ROLES = ['dkjoker', 'ivy', 'clayface', 'werewolf', 'serialkiller', 'joker', 'doctor', 'detective', 'officer', 'vigilante', 'batman', 'mother', 'father', 'son'];
const ACTION_WORD = { interrogate: 'interrogate', kill: 'kill', heal: 'heal', investigate: 'check', vigil: 'kill' };
function renderSideBox() {
  const box = $('sideBox');
  if (!state) return;
  if (amMod()) return renderModAbilityBox(box);
  const log = state.me.abilityLog || [];
  const show = !!(state.me.action || log.length || state.me.role === 'batman');
  box.classList.toggle('hidden', !show);
  if (!show) return;
  const sig = 'p|' + log.map((e) => e.id + (e.pending ? 'p' : '') + e.text).join(',');
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  const head = el('div', 'side-box-title');
  if (state.me.role) head.append(roleIcon(state.me.role));
  head.append(document.createTextNode(' Ability results'));
  box.append(head);
  if (!log.length) {
    box.append(el('p', 'side-box-empty', 'Use your night action. What you find out shows up here in the morning.'));
    return;
  }
  const list = el('div', 'side-box-list');
  for (const e of [...log].reverse()) {
    const row = el('div', 'ab-row ' + (e.tone || 'neutral') + (e.pending ? ' pending' : '') + (e.id === freshAbilityId ? ' fresh' : ''));
    row.append(el('div', 'ab-night', `${ABILITY_ICON[e.kind] || '🔮'} Night ${e.night}`));
    row.append(el('div', 'ab-text', e.text));
    if (e.pending) row.append(el('div', 'ab-sub', 'Waiting for the moderator…'));
    list.append(row);
  }
  box.append(list);
}

function renderModAbilityBox(box) {
  const roles = state.modView?.roles || {};
  const actions = state.modView?.nightActions || [];
  const people = Object.entries(roles)
    .filter(([, r]) => ABILITY_ROLES.includes(r))
    .sort((a, b) => ABILITY_ROLES.indexOf(a[1]) - ABILITY_ROLES.indexOf(b[1]));
  box.classList.toggle('hidden', !people.length);
  if (!people.length) return;
  const sig = 'm|' + JSON.stringify([people, actions, state.dead, channel, selectedThread, [...unreadThreads]]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  box.append(el('div', 'side-box-title', '🎭 Ability players'));
  const list = el('div', 'side-box-list');
  for (const [k, r] of people) {
    const name = displayName(k);
    const dead = isDeadName(name);
    const open = channel === 'mod' && selectedThread === k;
    const b = el('button', 'ap-row' + (dead ? ' dead' : '') + (open ? ' on' : ''));
    b.type = 'button';
    b.title = `Open your chat with ${name}`;
    b.append(avatar(name, 'sm'));
    const t = el('div', 'ap-text');
    t.append(el('div', 'ap-name', name + (dead ? ' 💀' : '')));
    t.append(roleLabel('ap-role', r, ROLE[r].label));
    const act = actions.find((a) => key(a.actor) === k);
    if (act?.target || act?.skip) t.append(el('div', 'ap-pick', `${state.phase === 'night' ? 'Tonight' : 'Last night'}: ${ACTION_WORD[act.kind]} ${act.skip ? 'nobody' : act.target}`));
    b.append(t);
    if (unreadThreads.has(k)) b.append(el('span', 'new'));
    b.onclick = () => {
      selectedThread = k;
      unreadThreads.delete(k);
      switchChannel('mod');
    };
    list.append(b);
  }
  box.append(list);
}

// Manual roles: the moderator gives each player a role, then starts the game.
// Roles only one player can have at a time.
const UNIQUE_ROLES = ['mother', 'father', 'son', 'joker', 'vigilante', 'batman', 'dkjoker', 'harley', 'ivy', 'clayface'];
// Is this unique role already given to someone other than this player?
function roleTakenByOther(role, name) {
  if (!UNIQUE_ROLES.includes(role)) return false;
  return Object.entries(state.modView?.roles || {}).some(([k, r]) => r === role && k !== key(name));
}
const assignRoles = () => (dkMode() ? ['civilian', 'doctor', 'detective', 'officer', ...DK_VILLAINS] : ['civilian', 'werewolf', 'doctor', 'detective', 'officer', 'mother', 'father', 'son']);
function renderAssigning(card, players) {
  const roles = state.modView?.roles || {};
  if (!amMod()) {
    card.append(el('p', 'start-sub', `⏳ Waiting for ${state.moderator || 'the moderator'} to assign roles…`));
    card.append(el('p', 'hint', 'You get a pop-up with your secret role. The game starts right after.'));
    return;
  }
  const given = players.filter((u) => roles[key(u.name)]).length;
  const killers = Object.values(roles).filter((r) => (dkMode() ? r === 'dkjoker' : r === 'werewolf' || r === 'serialkiller')).length;
  card.append(el('p', 'start-sub', 'Give every player a role, then start the game.'));
  card.append(el('div', 'start-label', `Roles given (${given} / ${players.length})`));
  const list = el('div', 'assign-list');
  for (const u of players) {
    const row = el('div', 'assign-row');
    const who = el('div', 'assign-who');
    who.append(avatar(u.name, 'sm'), el('span', '', u.name + (u.bot ? ' 🤖' : '')));
    row.append(who);
    const cur = roles[key(u.name)];
    if (isPhone()) {
      // Phone: tap the role to pick from a box of role tiles, like the tiles on computers and iPads.
      const shown = cur === 'serialkiller' ? 'werewolf' : cur;
      const chip = el('button', 'assign-chip' + (cur ? ' has ' + shown : ''));
      chip.type = 'button';
      chip.setAttribute('aria-label', `Pick a role for ${u.name}`);
      if (cur) chip.append(roleIcon(cur), el('span', 'assign-chip-label', ROLE[cur].label));
      else chip.append(el('span', 'assign-none', 'Pick role'));
      chip.append(el('span', 'assign-chip-caret', '▾'));
      chip.onclick = () => openRolePicker(u.name);
      row.append(chip);
      list.append(row);
      continue;
    }
    const btns = el('div', 'assign-btns');
    for (const r of assignRoles()) {
      const on = cur === r || (r === 'werewolf' && cur === 'serialkiller');
      const b = el('button', 'assign-btn' + (on ? ' on ' + r : ''));
      b.type = 'button';
      b.title = ROLE[r].label;
      b.append(roleIcon(r === 'werewolf' && killers <= 1 && (on || !killers) ? 'serialkiller' : r));
      b.onclick = () => socket.emit('mod:role', { to: u.name, role: on ? null : r });
      if (!on && roleTakenByOther(r, u.name)) {
        b.disabled = true;
        b.classList.add('taken');
        b.title = `${ROLE[r].label} is already given to someone else`;
      }
      btns.append(b);
    }
    row.append(btns);
    list.append(row);
  }
  card.append(list);
  if (!killers) card.append(el('p', 'start-warn', dkMode() ? 'Give someone The Joker role: he is the one who kills.' : 'There needs to be at least one killer: give someone the Werewolf role.'));
  else card.append(el('p', 'hint', dkMode() ? 'The Joker picks a victim each night.' : killers === 1 ? 'One killer: they play as the Serial Killer.' : `${killers} werewolves share the wolf den.`));
  if (given < players.length) card.append(el('p', 'hint', `${players.length - given} player${players.length - given === 1 ? ' has' : 's have'} no role yet and will be ${players.length - given === 1 ? 'a Civilian' : 'Civilians'}.`));
  const go = btn('btn-primary btn-lg btn-block', '▶ Start game', () => socket.emit('game:begin'));
  go.disabled = !killers;
  card.append(go);
  card.append(btn('btn-ghost btn-block', '← Back', () => socket.emit('game:cancel')));
}

// ---------- Character select ----------
function myCharacter() {
  return state?.users.find((u) => key(u.name) === key(me))?.character || null;
}
function openCharSelect() {
  // On phones the character is picked before the game, not in the middle of it.
  if (isPhone() && state?.gameState === 'running') return;
  closeDrawers();
  $('charError').textContent = '';
  $('charSelect').classList.remove('hidden');
  renderCharGrid();
}
// On phones the screen shows one character at a time; arrows (or a swipe) browse.
let charIdx = null;
let charBrowsed = false; // true once the player used the arrows
function charOptions() {
  return [...(window.CHARACTERS || []).map((c) => ({ id: c.id, name: c.name, desc: c.desc, img: c.img })), { id: null, name: 'No character', desc: 'Just play with your name.' }];
}
function renderCharGrid() {
  const grid = $('charGrid');
  const mine = myCharacter();
  const opts = charOptions();
  const phone = isPhone();
  const takenBy = new Map((state?.users || []).filter((u) => u.character && key(u.name) !== key(me)).map((u) => [u.character, u.name]));
  // Start on your current character, or on the first free one if you have none yet.
  if (charIdx === null || charIdx >= opts.length || !charBrowsed) {
    charIdx = mine ? Math.max(0, opts.findIndex((o) => o.id === mine)) : Math.max(0, opts.findIndex((o) => !o.id || !takenBy.has(o.id)));
  }
  const sig = JSON.stringify([mine, [...takenBy], phone, phone && charIdx]);
  if (grid.dataset.sig === sig) return;
  grid.dataset.sig = sig;
  grid.innerHTML = '';
  grid.classList.toggle('carousel', phone);
  const pick = (id, then) => {
    $('charError').textContent = '';
    socket.emit('character:pick', id, (res) => {
      if (!res?.ok) $('charError').textContent = res?.error || 'Could not pick that character.';
      else then?.();
    });
  };
  opts.forEach((o, i) => {
    const holder = o.id && takenBy.get(o.id);
    const b = el('button', 'char-tile' + (mine === o.id ? ' on' : '') + (holder ? ' taken' : '') + (i === charIdx ? ' shown' : ''));
    b.type = 'button';
    b.disabled = !!holder;
    const pic = el('div', 'char-pic');
    pic.innerHTML = o.img ? `<img src="${o.img}" alt="" draggable="false">` : '<div class="char-none">🙂</div>';
    b.append(pic, el('div', 'char-name', o.name), el('div', 'char-desc', holder ? `Taken by ${holder}` : o.desc));
    if (mine === o.id) b.append(el('span', 'char-check', '✓'));
    b.onclick = () => pick(o.id);
    grid.append(b);
  });
  const done = $('charDone');
  if (phone) {
    const go = (d) => {
      charBrowsed = true;
      charIdx = (charIdx + d + opts.length) % opts.length;
      renderCharGrid();
    };
    const prev = el('button', 'char-arrow prev', '‹');
    const next = el('button', 'char-arrow next', '›');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Previous character');
    next.setAttribute('aria-label', 'Next character');
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    const dots = el('div', 'char-dots');
    opts.forEach((_, i) => {
      const d = el('button', 'char-dot' + (i === charIdx ? ' on' : ''));
      d.type = 'button';
      d.setAttribute('aria-label', `Character ${i + 1}`);
      d.onclick = () => {
        charBrowsed = true;
        charIdx = i;
        renderCharGrid();
      };
      dots.append(d);
    });
    grid.append(prev, next, dots);
    // Swipe left/right to browse.
    grid.ontouchstart = (e) => (grid._sx = e.touches[0].clientX);
    grid.ontouchend = (e) => {
      const dx = e.changedTouches[0].clientX - (grid._sx ?? 0);
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    };
    const shown = opts[charIdx];
    const holder = shown.id && takenBy.get(shown.id);
    done.disabled = !!holder;
    done.textContent = holder ? `Taken by ${holder}` : shown.id ? `Play as ${shown.name} →` : 'Continue without a character →';
    done.onclick = () => pick(shown.id, closeCharSelect);
  } else {
    grid.ontouchstart = grid.ontouchend = null;
    done.disabled = false;
    done.textContent = mine ? 'Play as this character →' : 'Continue without a character →';
    done.onclick = closeCharSelect;
  }
}
function closeCharSelect() {
  $('charSelect').classList.add('hidden');
  charIdx = null;
  charBrowsed = false;
  focusComposer();
}

// After a reset the moderator picks a character again too.
socket.on('game:reset', () => {
  toast('🔄 Everyone was kicked and the game was reset.');
  openCharSelect();
});

// ---------- Phone: fixed button menu (top left) and players list (top right) ----------
const isPhone = () => matchMedia('(max-width: 760px)').matches;
let playersExpanded = false;
try {
  playersExpanded = localStorage.getItem('playersExpanded') === '1';
} catch {}

function openPanel(side) {
  const el = $(side === 'left' ? 'sideLeft' : 'sideRight');
  el.classList.add('open');
  $('scrim').classList.add('on');
}

// Phone: the menu and panels stay pinned just under the top bar, whatever bars the chat shows.
function phoneTop() {
  const h = document.querySelector('.chat-header');
  return h.offsetTop + h.offsetHeight + 8;
}
function renderPhoneDock() {
  const dock = $('phoneDock');
  if (!state) return;
  dock.style.top = phoneTop() + 'px';
  const items = [];
  const pill = (n) => (n ? (n > 9 ? '9+' : String(n)) : '');
  // Nobody runs the game: anyone can step up (shown first so it's easy to find).
  if (!state.moderator && !amMuted()) items.push({ id: 'claim', icon: '🛡️', label: 'Be mod', badge: '!', go: () => socket.emit('mod:claim') });
  items.push({ id: 'lobby', icon: '#', label: 'Lobby', on: channel === 'lobby', badge: pill(lobbyUnread), go: () => switchChannel('lobby') });
  items.push({ id: 'mod', icon: '🛡️', label: amMod() ? 'Inbox' : 'Mod', on: channel === 'mod', badge: pill(modUnread), go: () => switchChannel('mod') });
  if (state.me.wolfAccess) items.push({ id: 'wolf', img: dkMode() ? 'dkjoker' : 'werewolf', label: dkMode() ? 'Mile' : 'Wolves', on: channel === 'wolf', badge: pill(wolfUnread), lock: state.phase !== 'night', go: () => switchChannel('wolf') });
  if (state.me.canCard) items.push({ id: 'card', icon: '🃏', label: 'Card', go: () => openNoteEditor('card') });
  if (!amMod()) items.push({ id: 'manifesto', icon: '📜', label: 'Will', go: () => openNoteEditor('manifesto') });
  if (state.me.disguise) items.push({ id: 'disguise', icon: '🎭', label: 'Disguise', go: openDisguisePicker });
  if (!amMod() && (state.me.action || state.me.abilityLog?.length || state.me.role === 'batman')) items.push({ id: 'results', icon: '🔮', label: 'Results', on: resultsOpen, go: toggleResultsPop });
  if (amMod()) items.push({ id: 'abilities', icon: '🎭', label: 'Roles', go: () => openPanel('left') });
  if (amMod()) {
    // The moderator's game panel: day/night, trials, roles, bots.
    items.push({ id: 'game', icon: '⚙️', label: 'Game', go: () => openPanel('right') });
  } else {
    // Players with an ability get a button for it: Kill, Protect or Investigate. Civilians get none.
    const a = state.me.action;
    if (a && state.gameState === 'running' && !amMuted()) {
      const [icon, label] = PHONE_ACT[a.kind];
      const waiting = a.kind === 'arrest' ? state.phase === 'day' && !a.done : state.phase === 'night' && !a.target && !a.skip && !state.me.arrestedTonight;
      items.push({ id: 'act', icon, label, on: actionOpen, badge: waiting ? '!' : '', go: toggleActionPop });
    }
    // Vote to reset (wipe everything), with a counter.
    const n = state.wipe.votes;
    const need = state.wipe.needed;
    items.push({
      id: 'reset',
      icon: state.me.wiped ? '✓' : '🧹',
      label: 'Reset?',
      count: `${n}/${need}`,
      on: state.me.wiped,
      go: () => socket.emit('wipe:vote'),
    });
  }
  // Characters are picked before a game, not during one.
  if (state.gameState !== 'running') items.push({ id: 'char', icon: '👤', label: 'Me', go: openCharSelect });
  const sig = JSON.stringify(items.map((i) => [i.id, i.on, i.badge, i.lock, i.label, i.count]));
  // Leave room so the newest messages aren't hidden under the menu at first,
  // and keep the moderator's inbox bars below the panels.
  requestAnimationFrame(() => {
    const phone = isPhone();
    const gap = dock.offsetHeight + 16;
    // A bar above the chat (like a trial) goes below the menu; otherwise the messages start below it.
    const bars = ['trialBanner', 'threadTabs', 'roleBar'].map($);
    for (const b of bars) b.style.marginTop = '';
    const first = bars.find((b) => !b.classList.contains('hidden'));
    if (phone && first) first.style.marginTop = gap + 'px';
    $('messages').style.paddingTop = phone ? (first ? '12px' : gap + 'px') : '';
    // Moderator inbox: the players box sits on the left, so the messages move right.
    const threads = $('phoneThreads');
    $('messages').style.paddingLeft = phone && !threads.classList.contains('hidden') ? threads.offsetWidth + 16 + 'px' : '';
  });
  if (dock.dataset.sig === sig) return;
  dock.dataset.sig = sig;
  dock.innerHTML = '';
  for (const it of items) {
    const b = el('button', 'dock-btn' + (it.on ? ' on' : '') + (it.label.length > 8 ? ' long' : ''));
    b.type = 'button';
    const ic = el('span', 'dock-icon');
    if (it.img) ic.append(roleIcon(it.img));
    else ic.textContent = it.icon;
    b.append(ic, el('span', 'dock-label', it.label));
    if (it.badge) b.append(el('span', 'dock-badge', it.badge));
    if (it.count) b.append(el('span', 'dock-count', it.count));
    if (it.lock) b.append(el('span', 'dock-lock', '🔒'));
    b.onclick = it.go;
    dock.append(b);
  }
}

function renderPhonePlayers() {
  const box = $('phonePlayers');
  if (!state) return;
  box.style.top = phoneTop() + 'px';
  // In the moderator's inbox the players box on the left takes over.
  box.classList.toggle('in-inbox', amMod() && channel === 'mod');
  const roles = state.modView?.roles;
  const list = [...state.users].sort((a, b) => b.moderator - a.moderator);
  const sig = JSON.stringify([list, playersExpanded, roles, state.dead, me]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = '';
  const head = el('div', 'pp-head');
  head.append(el('span', 'pp-title', `👥 Players ${list.length}`));
  const ctr = el('div', 'pp-ctr');
  // One button in the same place: + opens the list, − closes it.
  const toggle = el('button', 'pp-btn', playersExpanded ? '−' : '+');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', playersExpanded ? 'Show fewer players' : 'Show all players');
  toggle.disabled = !playersExpanded && list.length <= 1;
  const setExp = (v) => {
    playersExpanded = v;
    try {
      localStorage.setItem('playersExpanded', v ? '1' : '0');
    } catch {}
    renderPhonePlayers();
    renderCluesBar();
  };
  toggle.onclick = () => setExp(!playersExpanded);
  ctr.append(toggle);
  head.append(ctr);
  box.append(head);
  const rows = el('div', 'pp-list');
  for (const u of playersExpanded ? list : list.slice(0, 1)) {
    const isMe = key(u.name) === key(me);
    const dead = state.dead?.includes(key(u.name));
    const r = el(amMod() && !u.moderator ? 'button' : 'div', 'pp-row' + (dead ? ' dead' : ''));
    r.append(avatar(u.name, 'sm'));
    const t = el('div', 'pp-text');
    t.append(el('div', 'pp-name', u.name + (isMe ? ' (you)' : '')));
    const role = knownRole(u.name);
    const sub = el('div', 'pp-sub');
    if (u.moderator) sub.textContent = '🛡️ Moderator';
    else if (dead) sub.textContent = '💀 Dead';
    else if (u.muted) sub.textContent = '🔇 Muted';
    else if (role) sub.append(roleIcon(role), document.createTextNode(' ' + ROLE[role].label));
    else if (u.bot) sub.textContent = '🤖 Bot';
    if (sub.childNodes.length) t.append(sub);
    r.append(t);
    if (amMod() && !u.moderator) {
      r.type = 'button';
      r.title = `Open your chat with ${u.name}`;
      r.onclick = () => {
        selectedThread = key(u.name);
        switchChannel('mod');
      };
    }
    rows.append(r);
  }
  box.append(rows);
}

// ---------- Phone: small results window ----------
let resultsOpen = false;
function toggleResultsPop() {
  resultsOpen = !resultsOpen;
  if (resultsOpen) actionOpen = false;
  renderActionPop();
  renderResultsPop();
  $('phoneDock').dataset.sig = '';
  renderPhoneDock();
}
function renderResultsPop() {
  const pop = $('resultsPop');
  if (!state) return;
  const show = resultsOpen && isPhone() && !amMod();
  pop.classList.toggle('hidden', !show);
  if (!show) return;
  const dock = $('phoneDock');
  pop.style.top = dock.offsetTop + dock.offsetHeight + 6 + 'px';
  const log = state.me.abilityLog || [];
  const sig = JSON.stringify(log.map((e) => [e.id, e.text, e.pending]));
  if (pop.dataset.sig === sig) return;
  pop.dataset.sig = sig;
  pop.innerHTML = '';
  const head = el('div', 'rp-head');
  head.append(el('span', '', '🔮 Your results'));
  const x = el('button', 'rp-close', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.onclick = toggleResultsPop;
  head.append(x);
  pop.append(head);
  if (!log.length) {
    pop.append(el('div', 'rp-empty', 'Nothing yet. Your result shows up here in the morning.'));
    return;
  }
  const list = el('div', 'rp-list');
  for (const e of [...log].reverse()) {
    const row = el('div', 'rp-row ' + (e.pending ? 'pending' : e.tone || 'neutral'));
    row.append(el('span', 'rp-night', `N${e.night}`), el('span', 'rp-text', e.pending ? 'Waiting for the moderator…' : e.text));
    list.append(row);
  }
  pop.append(list);
}
// Tap anywhere else to close it.
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#resultsPop, #actionPop, .dock-btn, #actionNav')) return;
  if (resultsOpen) toggleResultsPop();
  if (actionOpen) toggleActionPop();
});

// ---------- Phone: night action window (Kill / Protect / Investigate) ----------
const PHONE_ACT = { poison: ['🌿', 'Poison'], interrogate: ['🦇', 'Interrogate'], arrest: ['🚔', 'Arrest'], kill: ['🗡️', 'Kill'], heal: ['🛡️', 'Protect'], investigate: ['🔍', 'Investigate'], vigil: ['🎯', 'Kill'] };
let actionOpen = false;
function toggleActionPop() {
  actionOpen = !actionOpen;
  if (actionOpen && resultsOpen) {
    resultsOpen = false;
    renderResultsPop();
  }
  renderActionPop();
  if (state) renderActionNav();
  $('phoneDock').dataset.sig = '';
  renderPhoneDock();
}
// Where the pick list opens: under the menu on phones, beside the left box on bigger screens.
function placeActionPop(pop) {
  if (isPhone()) {
    const dock = $('phoneDock');
    pop.style.top = dock.offsetTop + dock.offsetHeight + 6 + 'px';
    pop.style.left = '';
    return;
  }
  const side = $('sideLeft');
  const docked = getComputedStyle(side).position !== 'fixed';
  const tile = $('actionNav').getBoundingClientRect();
  const left = docked ? side.getBoundingClientRect().right + 12 : 16;
  let top = docked && tile.height ? tile.top - 8 : 80;
  top = Math.max(12, Math.min(top, innerHeight - pop.offsetHeight - 12));
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}
function renderActionPop() {
  const pop = $('actionPop');
  if (!state) return;
  const a = state.me.action;
  if (!a || amMod() || amMuted() || state.gameState !== 'running') actionOpen = false;
  const show = actionOpen;
  pop.classList.toggle('hidden', !show);
  if (!show) return;
  const night = state.phase === 'night';
  const sig = JSON.stringify([a, night, state.me.arrestedTonight]);
  if (pop.dataset.sig === sig) return placeActionPop(pop);
  pop.dataset.sig = sig;
  requestAnimationFrame(() => placeActionPop(pop));
  pop.innerHTML = '';
  const [icon, label] = PHONE_ACT[a.kind];
  if (a.kind === 'arrest' || (state.me.arrestedTonight && night)) {
    const head = el('div', 'rp-head');
    head.append(el('span', '', `${icon} ${label}`));
    const x = el('button', 'rp-close', '✕');
    x.type = 'button';
    x.onclick = toggleActionPop;
    head.append(x);
    pop.append(head);
    if (a.kind !== 'arrest') return pop.append(el('div', 'rp-empty', 'You were arrested today, so you cannot use your ability tonight.'));
    return arrestBody(pop, a, 'ap-pick', 'rp-empty');
  }
  const head = el('div', 'rp-head');
  head.append(el('span', '', `${icon} ${label}`));
  const x = el('button', 'rp-close', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.onclick = toggleActionPop;
  head.append(x);
  pop.append(head);
  if (!night) {
    pop.append(el('div', 'rp-empty', a.target ? `Last night you chose ${a.target}. You can choose again at night.` : 'You can choose at night.'));
    return;
  }
  const hint = { poison: 'Who do you want to poison? Their ability gets confused tonight.', interrogate: 'Who do you want to interrogate? If they are innocent, you lose this ability.', vigil: 'Who do you want to kill?', kill: 'Who do you want to kill?', heal: 'Who do you want to protect?', investigate: 'Who do you want to investigate?' }[a.kind];
  pop.append(el('div', 'rp-empty', a.skip ? 'You chose to kill nobody tonight. Tap someone to change.' : a.target ? `You chose ${a.target}. Tap someone else to change.` : hint));
  const list = el('div', 'rp-list');
  // Wolves: who in the pack picked whom, and how many votes each player has.
  const packSize = a.pack?.length ? a.pack.length + 1 : 0;
  const votersFor = (name) => {
    if (!packSize) return [];
    const v = a.pack.filter((p) => (name === null ? p.skip : !p.skip && p.target === name)).map((p) => p.name);
    if (name === null ? a.skip : !a.skip && a.target === name) v.unshift('you');
    return v;
  };
  const voteTag = (voters) => {
    const t = el('span', 'ap-votes' + (voters.length === packSize ? ' full' : ''));
    t.append(el('b', '', `${voters.length}/${packSize}`));
    t.title = voters.join(', ');
    return t;
  };
  for (const name of a.targets) {
    const on = a.target === name;
    const voters = votersFor(name);
    const b = el('button', 'ap-pick' + (on ? ' on ' + a.kind : '') + (voters.length ? ' voted' : ''));
    b.type = 'button';
    const nm = el('span', 'ap-pick-name');
    nm.append(el('span', 'ap-pick-who', name + (key(name) === key(me) ? ' (you)' : '')));
    if (voters.length) nm.append(el('span', 'ap-pick-by', 'Picked by ' + voters.join(', ')));
    b.append(avatar(name, 'sm'), nm);
    if (packSize && voters.length) b.append(voteTag(voters));
    else if (on) b.append(el('span', 'ap-pick-tick', '✓'));
    b.onclick = () => socket.emit('night:choose', on ? null : name);
    list.append(b);
  }
  for (const x of a.investigated || []) {
    const b = el('div', 'ap-pick done');
    b.append(avatar(x.name, 'sm'), el('span', 'ap-pick-name', x.name), el('span', 'ap-pick-note', x.label || '…'));
    list.append(b);
  }
  if (!a.targets.length && !a.investigated?.length) list.append(el('div', 'rp-empty', 'There is nobody to choose.'));
  if (a.kind === 'kill' || a.kind === 'vigil') {
    const nb = el('button', 'ap-pick nobody' + (a.skip ? ' on kill' : ''));
    nb.type = 'button';
    nb.append(el('span', 'nobody-icon', '🚫'), el('span', 'ap-pick-name', 'Kill nobody tonight'));
    const nv = votersFor(null);
    if (packSize && nv.length) nb.append(voteTag(nv));
    else if (a.skip) nb.append(el('span', 'ap-pick-tick', '✓'));
    nb.onclick = () => socket.emit('night:choose', a.skip ? null : '__nobody__');
    list.append(nb);
  }
  pop.append(list);
  // Wolves: show whether the pack agrees.
  if (packSize) {
    let status = '✗ The pack must all pick the same player';
    if (!a.agreed && !a.agreedNobody) {
      // Point out the player closest to being agreed on.
      let best = null, most = 0;
      for (const n of a.targets) {
        const c = votersFor(n).length;
        if (c > most) [best, most] = [n, c];
      }
      if (best && most > 0) {
        const need = packSize - most;
        status = `${best} has ${most}/${packSize}: ${need} more ${need === 1 ? 'wolf needs' : 'wolves need'} to pick them`;
      }
    }
    pop.append(el('div', 'ap-pack ' + (a.agreed || a.agreedNobody ? 'ok' : 'no'), a.agreed ? `✓ Pack agrees: ${a.agreed}` : a.agreedNobody ? '✓ Pack agrees: nobody tonight' : status));
  }
}

// ---------- Officer: arrest one player by day ----------
function arrestBody(box, a, rowCls, hintCls) {
  const day = state.phase === 'day';
  if (!day) return box.append(el('div', hintCls, a.target ? `You arrested ${a.target} today.` : 'You can arrest someone during the day.'));
  if (a.target) return box.append(el('div', hintCls, `You arrested ${a.target}. They cannot vote today or use an ability tonight.`));
  if (a.done) return box.append(el('div', hintCls, 'Someone has already been arrested today.'));
  box.append(el('div', hintCls, 'Who do you want to arrest? They cannot vote today or use an ability tonight. This is final.'));
  const list = el('div', rowCls === 'ap-pick' ? 'rp-list' : 'target-list');
  for (const name of a.targets) {
    const b = el('button', rowCls);
    b.type = 'button';
    b.append(avatar(name, 'sm'), el('span', rowCls === 'ap-pick' ? 'ap-pick-name' : 'tname', name));
    b.onclick = () =>
      openModal((card) => {
        card.append(el('div', 'note-icon', '🚔'));
        card.append(el('h2', '', `Arrest ${name}?`));
        card.append(el('p', '', 'They cannot vote today and cannot use their ability tonight. You can only arrest one player a day.'));
        const actions = el('div', 'actions');
        actions.append(
          btn('btn-ghost', 'Cancel', closeModal),
          btn('btn-primary', `🚔 Arrest ${name}`, () => {
            socket.emit('arrest:choose', name);
            closeModal();
          })
        );
        card.append(actions);
      });
    list.append(b);
  }
  box.append(list);
}
function renderArrestCard(card, a) {
  const sig = JSON.stringify(['arrest', a, state.phase]);
  if (card.dataset.sig === sig) return;
  card.dataset.sig = sig;
  card.className = 'card action-card investigate';
  card.innerHTML = '';
  const title = el('div', 'card-title');
  title.append(roleIcon('officer'), document.createTextNode(' Your day action: Arrest'));
  card.append(title);
  arrestBody(card, a, 'target-btn', 'hint');
}
socket.on('arrested', () => {
  const show = () =>
    openModal((card) => {
      card.append(el('div', 'note-icon', '🚔'));
      card.append(el('h2', '', 'You have been arrested'));
      card.append(el('p', '', 'You cannot vote today, and you cannot use your ability tonight.'));
      const actions = el('div', 'actions');
      actions.append(btn('btn-primary', 'OK', closeModal));
      card.append(actions);
    });
  if ($('modal').classList.contains('hidden')) show();
  else clueQueue.push({ __result: show });
});

// ---------- The Son becomes Batman ----------
socket.on('batman:rise', ({ you, name, secret }) => {
  const show = () =>
    openModal((card) => {
      card.append(el('div', 'note-icon', '🦇'));
      card.append(el('h2', '', you ? 'You have become Batman' : name ? `${name} has become Batman` : 'Batman has risen'));
      card.append(killVideo('batman'));
      card.append(el('p', 'hint', you ? 'Your parents are gone. Every morning you get a clue about the night.' : secret ? 'Hard mode: only you (the moderator) and Batman see this.' : name ? 'Other players see this without the name.' : 'The Son has become Batman. Nobody knows who he is.'));
      const actions = el('div', 'actions');
      actions.append(btn('btn-primary', 'Close', closeModal));
      card.append(actions);
    });
  if ($('modal').classList.contains('hidden')) show();
  else clueQueue.push({ __result: show });
});
