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
function openModal(build) {
  const card = $('modalCard');
  card.innerHTML = '';
  build(card);
  $('modal').classList.remove('hidden');
  // Restart the pop-in animation each time.
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
}
function closeModal() {
  $('modal').classList.add('hidden');
}
$('modal').addEventListener('click', (e) => e.target === $('modal') && closeModal());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
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
    $('msgInput').focus();
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
  maybeShowTrialPopup();
});

socket.on('notice', toast);

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
    if (message.check) toast(`🔍 The moderator answered: ${message.check.target} is ${message.check.result === 'wolf' ? 'a Wolf' : 'a Civilian'}.`);
  }
  if (channel !== 'mod' && message.from !== me) modUnread++;
  renderNav();
  if (channel === 'mod' && amMod()) renderThreadTabs();
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
    if (canVote()) {
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
    actions.append(btn('btn-ghost', canVote() ? 'Decide later' : 'Close', closeModal));
    card.append(actions);
  });
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
  const a = avatar(me);
  a.append(el('span', 'dot'));
  const who = el('div', 'who');
  who.append(el('div', 'name', me));
  const myRole = state.me.role && ROLE[state.me.role];
  let status = amMod() ? '🛡️ Moderator' : myRole ? `${myRole.icon} ${myRole.label}` : 'Player · no role yet';
  if (amMuted()) status += ' · 🔇 muted';
  who.append(el('div', 'status', status));
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
  sc.innerHTML = ART.scales;
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
      b.append(avatar(displayName(k), 'sm'), el('span', '', displayName(k) + (online ? '' : ' (left)') + (tr ? ' ' + ROLE[tr].icon : '')));
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
  if (sel.dataset.sig === sig) return updateCheckHint();
  sel.dataset.sig = sig;
  sel.innerHTML = '';
  sel.append(new Option('Who did they ask about?', ''));
  for (const n of options) sel.append(new Option(n, n));
  if (options.includes(prev)) sel.value = prev;
  updateCheckHint();
}
function updateCheckHint() {
  const target = $('checkTarget').value;
  const real = target && state.modView?.roles[key(target)];
  const hint = $('checkHint');
  const isWolf = real === 'werewolf' || real === 'serialkiller';
  hint.textContent = real ? `(really ${ROLE[real].icon} ${ROLE[real].label})` : target ? '(no role yet)' : '';
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
      ph = '🔇 You are muted. You can only talk to the moderator.';
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
      ph = '🔇 You are muted. You can only talk to the moderator.';
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
    const icon = r === 'werewolf' && cfg.werewolf === 1 ? ROLE.serialkiller.icon : ROLE[r].icon;
    const lab = el('span', 'stepper-label', `${icon} ${label}`);
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
  civ.append(el('span', 'stepper-label', `${ROLE.civilian.icon} Civilians`), el('b', 'civ-count', String(civilians)));
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
}

function renderPanel() {
  renderPhaseDisplay();

  // Moderator tools
  $('modTools').classList.toggle('hidden', !amMod());
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
      const rt = el('span', 'role-tag', `${ROLE[role].icon} ${ROLE[role].label}`);
      rt.style.setProperty('--rc', ROLE[role].color);
      nameBox.append(rt);
    } else if (mv && !u.moderator) nameBox.append(el('span', 'role-tag none', 'no role'));
    li.append(a, nameBox);
    if (isMe) li.append(el('span', 'tag you', 'you'));
    if (u.bot) li.append(el('span', 'tag bot', '🤖 bot'));
    if (u.moderator) li.append(el('span', 'tag mod', 'mod'));
    if (u.muted) li.append(el('span', 'tag muted', 'muted'));
    if (mv && !u.moderator) {
      const isProt = mv.protected.includes(key(u.name));
      if (isProt) li.append(el('span', 'tag prot', '🛡️ protected'));
      const pb = el('button', 'protect-btn' + (isProt ? ' on' : ''), '🛡️');
      pb.type = 'button';
      pb.title = isProt ? `Remove protection from ${u.name}` : `Mark ${u.name} as protected`;
      pb.onclick = () => socket.emit('protect:toggle', u.name);
      li.append(pb);
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
  if (m.system) {
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
      r.append(art, el('div', '', `Secret role: ${info.icon} ${info.label}`));
      bubble.append(r);
    } else if (m.check) {
      const wolf = m.check.result === 'wolf';
      const r = el('div', 'role-msg check-msg');
      const art = el('div', 'art');
      art.innerHTML = ART[wolf ? 'werewolf' : 'civilian'];
      const txt = el('div');
      txt.append(el('div', 'check-kicker', '🔍 Investigation result'));
      const line = el('div', 'check-line');
      line.append(el('b', '', m.check.target), document.createTextNode(' is '), el('b', 'check-verdict ' + (wolf ? 'wolf' : 'civ'), wolf ? '🐺 a Wolf' : '🧑‍🌾 a Civilian'));
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
  const night = state.phase === 'night';
  $('phaseTimerLabel').textContent = night ? '🌙 Night' : '☀️ Day';
  const text = formatElapsed(Date.now() + clockOffset - state.phaseStartedAt);
  if ($('phaseTimerTime').textContent !== text) $('phaseTimerTime').textContent = text;
  $('phaseTimer').classList.toggle('night', night);
}
setInterval(tickPhaseTimer, 250);
