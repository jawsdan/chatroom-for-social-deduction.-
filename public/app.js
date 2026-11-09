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
let modThreads = {}; // moderator only: key -> []
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
  officer: { label: 'Officer', icon: '👮', color: '#3b82f6', desc: 'Each night, ask the moderator to investigate one player.' },
};

$('joinLogo').innerHTML = ART.night;
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
  if (state.me.wolfmates?.some((n) => key(n) === k)) return 'werewolf';
  return null;
}
// Small round role picture to use next to text.
function roleIcon(role) {
  const img = el('img', 'ri');
  img.src = `img/roles/sm/${role}.webp`;
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
  socket.emit('join', name, (res) => {
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
socket.on('kicked', () => {
  try {
    sessionStorage.setItem('kicked', '1');
  } catch {}
  me = null;
  location.reload();
});
try {
  if (sessionStorage.getItem('kicked')) {
    sessionStorage.removeItem('kicked');
    $('joinError').textContent = 'You were removed from the game by the moderator.';
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

socket.on('mod:thread', (list) => {
  myThread = list;
  if (channel === 'mod' && !amMod()) renderMessages();
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
  if (!silent && phase === 'night' && state?.me?.wolfAccess && !amMod()) setTimeout(() => toast('🐺 The wolf den is open. Plan your target!'), 1800);
  if (state) renderAll(false);
});

socket.on('role:assigned', ({ role }) => {
  if (!role) return toast('The moderator removed your role.');
  const r = ROLE[role];
  openModal((card) => {
    const art = el('div', 'art role');
    art.innerHTML = ART[role];
    card.append(art);
    card.append(el('div', 'role-kicker', 'Your secret role'));
    card.append(el('h2', '', `You are ${/^[aeiou]/i.test(r.label) ? 'an' : 'a'} ${r.label}`));
    card.append(el('p', '', r.desc));
    card.append(el('p', 'hint', 'Only you and the moderator can see this.'));
    const actions = el('div', 'actions');
    actions.append(btn('btn-primary', 'Got it', closeModal));
    card.append(actions);
  });
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
    card.append(el('h2', '', `The village has decided. ${r.accused} is`));
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
  txt.append(el('div', 'p-sub', currentPhase === 'night' ? 'The werewolves are awake…' : 'Discuss and find the wolves.'));
  d.append(art, txt);
}

// ---------- Trial ----------
function canVote() {
  const t = state?.trial;
  if (!t || !t.open) return false;
  return !amMod() && !amMuted() && key(t.accused) !== key(me);
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
    let text = 'The village is voting.';
    if (key(t.accused) === key(me)) text = 'The village is deciding your fate. Plead your case in the main chat!';
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
document.querySelectorAll('#roleBar button').forEach((b) => {
  b.onclick = () => selectedThread && socket.emit('mod:role', { to: displayName(selectedThread), role: b.dataset.role || null });
});

// ---------- Channels ----------
function switchChannel(c) {
  channel = c;
  if (c === 'mod') modUnread = 0;
  if (c === 'lobby') lobbyUnread = 0;
  if (c === 'wolf') wolfUnread = 0;
  closeDrawers();
  renderAll();
  if (!$('msgInput').disabled) $('msgInput').focus();
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
  renderCluesBar();
  renderStartScreen();
  renderModOverview();
  renderThreadTabs();
  renderComposer();
  renderPanel();
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
    sub.textContent = `${state.users.length} ${state.users.length === 1 ? 'person' : 'people'} here · everyone can see this chat`;
  } else if (channel === 'mod') {
    title.textContent = amMod() ? '🛡️ Moderator inbox' : '🛡️ Talk to the moderator';
    sub.textContent = amMod()
      ? 'Private chats. Each player only sees their own.'
      : state.moderator
        ? `Private. Only you and ${state.moderator} can see this.`
        : 'Private. No moderator yet, but your messages will be waiting.';
  } else if (channel === 'wolf') {
    const wolves = (amMod() ? Object.entries(state.modView?.roles || {}).filter(([, r]) => r === 'werewolf').map(([k]) => displayName(k)) : state.me.wolfmates);
    title.textContent = '🐺 Wolf den';
    sub.textContent = (state.phase === 'night' ? 'Open now' : 'Closed until night') + ` · secret chat for the werewolves${wolves.length ? ': ' + wolves.join(', ') : ''}`;
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
  tabs.classList.toggle('hidden', !show);
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
  $('roleBar').classList.toggle('hidden', !show || !selectedThread);
  renderCheckBar(show);
  $('roleTarget').textContent = selectedThread ? displayName(selectedThread) : '';
  const cur = selectedThread && state.modView?.roles[selectedThread];
  document.querySelectorAll('#roleBar button').forEach((b) => {
    const r = b.dataset.role;
    b.classList.toggle('current', !!r && (r === cur || (r === 'werewolf' && cur === 'serialkiller')));
  });
}

// The moderator answers an Officer's question: is this player a wolf or a civilian?
function renderCheckBar(show) {
  const bar = $('checkBar');
  const askerRole = selectedThread && state.modView?.roles[selectedThread];
  const visible = show && askerRole === 'officer';
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
  // Pre-fill with the player the Officer picked tonight (once per new pick).
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
  const isWolf = real === 'werewolf' || real === 'serialkiller';
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

function renderComposer() {
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
    } else ph = 'Message the moderator privately…';
  } else if (channel === 'wolf') {
    if (amMod()) ph = 'Message the wolves (as moderator)…';
    else if (state.phase !== 'night') {
      disabled = true;
      ph = '🌙 The wolf den opens at night.';
    } else if (amMuted()) {
      disabled = true;
      ph = state.me.dead && state.dead?.includes(key(me)) ? '💀 You are dead. You can only talk to the moderator.' : '🔇 You are muted. You can only talk to the moderator.';
    } else ph = 'Plan your target with the pack…';
  }
  input.disabled = disabled;
  send.disabled = disabled;
  input.placeholder = ph;
  $('composer').classList.toggle('locked', disabled);
}

function renderRolesCard() {
  const card = $('rolesCard');
  card.classList.toggle('hidden', !amMod());
  if (!amMod() || !state.modView) return;
  const cfg = state.modView.roleConfig;
  const players = state.users.filter((u) => !u.moderator).length;
  const special = cfg.werewolf + cfg.doctor + cfg.officer;
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
  row('werewolf', cfg.werewolf === 1 ? 'Serial Killer' : 'Werewolves');
  row('doctor', 'Doctors');
  row('officer', 'Officers');
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
  // Officer results: automatic at sunrise, or answered by the moderator.
  let om = $('officerMode');
  if (!om) {
    om = el('div', 'officer-mode');
    om.id = 'officerMode';
    $('rolesCard').append(om);
  }
  const mode = state.modView.officerMode;
  const sig = mode;
  if (om.dataset.sig !== sig) {
    om.dataset.sig = sig;
    om.innerHTML = '';
    om.append(roleLabel('start-label', 'officer', 'Officer results'));
    const seg = el('div', 'segmented');
    for (const [m, t] of [['auto', '⚙️ Automatic'], ['manual', '✋ Manual']]) {
      const b = el('button', mode === m ? 'on' : '', t);
      b.type = 'button';
      b.onclick = () => socket.emit('officer:mode', m);
      seg.append(b);
    }
    om.append(seg, el('p', 'hint', mode === 'auto' ? 'The Officer sees if their pick is good or bad at sunrise, by themselves.' : 'You answer the Officer with the Wolf / Civilian buttons in their chat.'));
  }
}

function renderPanel() {
  renderPhaseDisplay();
  renderActionCard();
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
    else if (state.me.wolfmates?.some((n) => key(n) === key(u.name))) role = 'werewolf';
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

  // Wipe everything: the players vote, the moderator doesn't have to.
  const wb = $('wipeBox');
  wb.innerHTML = '';
  const n = state.wipe.votes;
  const need = state.wipe.needed;
  const lab = el('div', 'progress-label');
  lab.append(el('span', '', 'Players who voted'), el('b', '', `${n} / ${need}`));
  const bar = el('div', 'progress');
  const fill = el('i');
  fill.style.width = (100 * n) / Math.max(need, 1) + '%';
  bar.append(fill);
  wb.append(lab, bar);
  if (amMod()) {
    if (need === 0) wb.append(btn('btn-block', '🧹 Wipe everything now', () => socket.emit('wipe:vote')));
    else wb.append(el('p', 'hint wipe-note', "You don't need to vote. It happens when all players have voted."));
  } else {
    const voted = state.me.wiped;
    wb.append(btn('btn-block ' + (voted ? 'on' : ''), voted ? '✓ You voted (undo)' : '🧹 Vote to wipe everything', () => socket.emit('wipe:vote')));
  }
}

// ---------- Messages ----------
function currentMessages() {
  if (channel === 'lobby') return lobbyMsgs;
  if (channel === 'mod') return amMod() ? modThreads[selectedThread] || [] : myThread;
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
      } else box.append(emptyState('🤫', 'Just you and the moderator', 'Nobody else can see what you write here.'));
    } else if (channel === 'lobby') box.append(emptyState('👋', 'The lobby is quiet', 'Say hello to the village!'));
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
    node = el('div', 'msg-system clue-note', c.kind === 'card' ? `🃏 A calling card was found with ${c.about} — pinned top right` : `📜 ${c.about}'s manifesto was revealed — pinned top right`);
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
      const role = m.action.kind === 'kill' ? (knownRole(m.from) || 'werewolf') : m.action.kind === 'heal' ? 'doctor' : 'officer';
      art.innerHTML = ART[role] || '';
      const txt = el('div');
      const status = m.action.locked ? ' · 🔒 locked in' : m.action.changes ? ` · changed ${m.action.changes}×` : '';
      txt.append(el('div', 'check-kicker', `🌙 Night action · ${ACTION_TEXT[m.action.kind].noun}${status}`));
      if (m.action.locked) bubble.classList.add('locked');
      const line = el('div', 'check-line');
      if (m.action.target) line.append(el('b', '', m.from), document.createTextNode(` chose to ${ACTION_TEXT[m.action.kind].verb} `), el('b', 'action-target ' + m.action.kind, m.action.target));
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
function renderRoleFx() {
  const role = !state || amMod() ? null : state.me.role || null;
  if (role === fxRole) return;
  fxRole = role;
  const fx = $('roleFx');
  const back = $('roleFxBack');
  back.innerHTML = '';
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
  } else if (role === 'officer') {
    add('fx-sirenglow');
    add('fx-edge fx-top sirens', '', '<div class="siren red"></div><div class="siren blue"></div>');
    add('fx-edge fx-bottom tape', '', `<div class="tape-text">${'POLICE LINE · DO NOT CROSS · '.repeat(16)}</div>`);
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
  heal: { verb: 'heal', noun: 'Heal', title: 'Choose who to protect', btn: 'btn-success' },
  investigate: { verb: 'investigate', noun: 'Investigate', title: 'Choose who to investigate', btn: 'btn-primary' },
};

// The player's own panel: pick a target at night.
function renderActionCard() {
  const card = $('actionCard');
  const a = !amMod() && state.me.action;
  card.classList.toggle('hidden', !a);
  if (!a) return;
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
  card.append(el('p', 'hint', a.target ? `You chose ${a.target}. You can change it until morning.` : 'Only the moderator sees your choice.'));
  const list = el('div', 'target-list');
  for (const name of a.targets) {
    const b = el('button', 'target-btn' + (a.target === name ? ' on ' + a.kind : ''));
    b.type = 'button';
    b.append(avatar(name, 'sm'), el('span', 'tname', name + (key(name) === key(me) ? ' (you)' : '')));
    if (a.target === name) b.append(el('span', 'tag picked', '✓ ' + t.verb));
    b.onclick = () => socket.emit('night:choose', a.target === name ? null : name);
    list.append(b);
  }
  // Officer: players already investigated are shown but can't be picked again.
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
  card.append(list);
  if (a.pack?.length) {
    const pack = el('div', 'pack');
    pack.append(el('div', 'pack-title', 'Your pack — everyone must pick the same player'));
    pack.append(el('div', 'pack-status ' + (a.agreed ? 'ok' : 'no'), a.agreed ? `✓ The pack agrees on ${a.agreed}` : '✗ Not agreed yet: nobody dies unless you all pick the same player'));
    for (const p of a.pack) pack.append(el('div', 'pack-row', `${p.name} → ${p.target || 'not chosen yet'}`));
    card.append(pack);
  }
}

// The moderator's summary of tonight's choices.
function renderNightCard() {
  const card = $('nightCard');
  const list = amMod() && state.gameState === 'running' ? state.modView?.nightActions || [] : [];
  card.classList.toggle('hidden', !list.length);
  if (!list.length) return;
  card.innerHTML = '';
  const night = state.phase === 'night';
  card.append(el('div', 'card-title', night ? '🌙 Tonight\'s choices' : '🌙 Last night\'s choices'));
  if (night && state.modView?.outcome) card.append(el('div', 'outcome', `At sunrise: ${state.modView.outcome}`));
  const order = { kill: 0, heal: 1, investigate: 2 };
  for (const a of [...list].sort((x, y) => order[x.kind] - order[y.kind])) {
    const row = el('div', 'night-row' + (a.target ? '' : ' waiting'));
    row.append(avatar(a.actor, 'sm'));
    const txt = el('div', 'night-text');
    txt.append(el('b', '', a.actor));
    txt.append(document.createTextNode(a.muted ? ' · muted' : a.target ? ` → ${ACTION_TEXT[a.kind].verb} ` : ` · ${night ? 'choosing…' : 'chose nobody'}`));
    if (a.target && !a.muted) txt.append(el('b', 'action-target ' + a.kind, a.target));
    row.append(txt);
    card.append(row);
  }
}

// ---------- Calling cards, manifestos and clues ----------
$('cardNav').onclick = () => openNoteEditor('card');
$('manifestoNav').onclick = () => openNoteEditor('manifesto');

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
  d.append(el('div', 'clue-kicker', isCard ? `🃏 Calling card · found with ${clue.about}` : `📜 Manifesto of ${clue.about}`));
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
      art.innerHTML = ART[clue.result === 'wolf' ? (clue.label === 'Killer' ? 'serialkiller' : 'werewolf') : 'civilian'];
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
    card.append(el('div', 'note-icon', clue.kind === 'card' ? '🃏' : '📜'));
    card.append(el('h2', '', clue.kind === 'card' ? (fresh ? 'A calling card was found' : 'Calling card') : `${clue.about}'s manifesto`));
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
  const list = [...(state.clues || []), ...(state.me.privateClues || [])].sort((a, b) => b.ts - a.ts);
  const show = (channel === 'lobby' || (channel === 'mod' && !amMod())) && list.length > 0;
  box.classList.toggle('hidden', !show);
  if (!show) return;
  // Sit just below whatever banners are showing above the messages.
  box.style.top = $('messages').offsetTop + 10 + 'px';
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
    const kicker = c.kind === 'card' ? `🃏 Calling card · ${c.about}` : c.kind === 'check' ? `🔒 Your investigation` : `📜 ${c.about}`;
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
        card.append(el('p', 'hint', victims.some((v) => key(v) === key(me)) ? 'You are dead. You can only talk to the moderator now.' : 'They can no longer speak in the village.'));
      } else {
        card.append(el('h2', '', 'No victim'));
        card.append(el('p', '', 'The village wakes up. Nobody died last night.'));
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
  const order = ['werewolf', 'serialkiller', 'doctor', 'officer', 'civilian'];
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
  card.append(min, logo, el('h2', '', 'Village Chat'));
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
  if (amMod() && cfg) {
    const special = cfg.werewolf + cfg.doctor + cfg.officer;
    const setup = el('div', 'start-setup');
    const civ = Math.max(players.length - special, 0);
    const parts = [
      [cfg.werewolf === 1 ? 'serialkiller' : 'werewolf', cfg.werewolf === 1 ? '1 Serial Killer' : `${cfg.werewolf} Werewolves`],
      ['doctor', `${cfg.doctor} Doctor${cfg.doctor === 1 ? '' : 's'}`],
      ['officer', `${cfg.officer} Officer${cfg.officer === 1 ? '' : 's'}`],
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
    const noKiller = randomizeOnStart && cfg.werewolf < 1;
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
}

// ---------- Death animations ----------
// 'night' = the werewolf attack, 'killer' = the Serial Killer, 'vote' = the village's verdict,
// 'wolfdeath' = a werewolf shot with a silver bullet, 'found' = an officer finds the body. Plays once and stops on the last frame.
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
for (const k of ['night', 'killer', 'vote', 'wolfdeath', 'found']) {
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
      card.append(el('p', 'hint', key(victim) === key(me) ? 'You are dead. You can only talk to the moderator now.' : 'They can no longer speak in the village.'));
      const actions = el('div', 'actions');
      actions.append(btn('btn-primary', 'Close', closeModal));
      card.append(actions);
    });
  if ($('modal').classList.contains('hidden')) show();
  else clueQueue.unshift({ __result: show });
});

// ---------- Ability results ----------
const ABILITY_ICON = { kill: '🗡️', heal: '🩺', investigate: '🔍' };
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
const ABILITY_ROLES = ['werewolf', 'serialkiller', 'doctor', 'officer'];
const ACTION_WORD = { kill: 'kill', heal: 'heal', investigate: 'check' };
function renderSideBox() {
  const box = $('sideBox');
  if (!state) return;
  if (amMod()) return renderModAbilityBox(box);
  const log = state.me.abilityLog || [];
  const show = !!(state.me.action || log.length);
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
    if (act?.target) t.append(el('div', 'ap-pick', `${state.phase === 'night' ? 'Tonight' : 'Last night'}: ${ACTION_WORD[act.kind]} ${act.target}`));
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
const ASSIGN_ROLES = ['civilian', 'werewolf', 'doctor', 'officer'];
function renderAssigning(card, players) {
  const roles = state.modView?.roles || {};
  if (!amMod()) {
    card.append(el('p', 'start-sub', `⏳ Waiting for ${state.moderator || 'the moderator'} to assign roles…`));
    card.append(el('p', 'hint', 'You get a pop-up with your secret role. The game starts right after.'));
    return;
  }
  const given = players.filter((u) => roles[key(u.name)]).length;
  const killers = Object.values(roles).filter((r) => r === 'werewolf' || r === 'serialkiller').length;
  card.append(el('p', 'start-sub', 'Give every player a role, then start the game.'));
  card.append(el('div', 'start-label', `Roles given (${given} / ${players.length})`));
  const list = el('div', 'assign-list');
  for (const u of players) {
    const row = el('div', 'assign-row');
    const who = el('div', 'assign-who');
    who.append(avatar(u.name, 'sm'), el('span', '', u.name + (u.bot ? ' 🤖' : '')));
    row.append(who);
    const btns = el('div', 'assign-btns');
    const cur = roles[key(u.name)];
    for (const r of ASSIGN_ROLES) {
      const on = cur === r || (r === 'werewolf' && cur === 'serialkiller');
      const b = el('button', 'assign-btn' + (on ? ' on ' + r : ''));
      b.type = 'button';
      b.title = ROLE[r].label;
      b.append(roleIcon(r === 'werewolf' && killers <= 1 && (on || !killers) ? 'serialkiller' : r));
      b.onclick = () => socket.emit('mod:role', { to: u.name, role: on ? null : r });
      btns.append(b);
    }
    row.append(btns);
    list.append(row);
  }
  card.append(list);
  if (!killers) card.append(el('p', 'start-warn', 'There needs to be at least one killer: give someone the Werewolf role.'));
  else card.append(el('p', 'hint', killers === 1 ? 'One killer: they play as the Serial Killer.' : `${killers} werewolves share the wolf den.`));
  if (given < players.length && killers) card.append(el('p', 'hint', `${players.length - given} player${players.length - given === 1 ? ' has' : 's have'} no role yet.`));
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
  closeDrawers();
  $('charError').textContent = '';
  $('charSelect').classList.remove('hidden');
  renderCharGrid();
}
function renderCharGrid() {
  const grid = $('charGrid');
  const mine = myCharacter();
  const takenBy = new Map((state?.users || []).filter((u) => u.character && key(u.name) !== key(me)).map((u) => [u.character, u.name]));
  const sig = JSON.stringify([mine, [...takenBy]]);
  if (grid.dataset.sig === sig) return;
  grid.dataset.sig = sig;
  grid.innerHTML = '';
  const tile = (id, title, desc, imgHtml) => {
    const holder = id && takenBy.get(id);
    const b = el('button', 'char-tile' + (mine === id ? ' on' : '') + (holder ? ' taken' : ''));
    b.type = 'button';
    b.disabled = !!holder;
    const pic = el('div', 'char-pic');
    pic.innerHTML = imgHtml;
    b.append(pic, el('div', 'char-name', title), el('div', 'char-desc', holder ? `Taken by ${holder}` : desc));
    if (mine === id) b.append(el('span', 'char-check', '✓'));
    b.onclick = () => {
      $('charError').textContent = '';
      socket.emit('character:pick', id, (res) => {
        if (!res?.ok) $('charError').textContent = res?.error || 'Could not pick that character.';
      });
    };
    return b;
  };
  for (const c of window.CHARACTERS || []) {
    grid.append(tile(c.id, c.name, c.desc, `<img src="${c.img}" alt="" draggable="false">`));
  }
  grid.append(tile(null, 'No character', 'Just play with your name.', '<div class="char-none">🙂</div>'));
  $('charDone').textContent = mine ? 'Play as this character →' : 'Continue without a character →';
}
$('charDone').onclick = () => {
  $('charSelect').classList.add('hidden');
  if (!$('msgInput').disabled) $('msgInput').focus();
};
