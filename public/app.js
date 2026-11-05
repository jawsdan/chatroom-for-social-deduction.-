/* global io, ART */
const socket = io();
const $ = (id) => document.getElementById(id);
const key = (n) => String(n).toLowerCase();

let me = null; // my name
let state = null; // latest public state from server
let channel = 'lobby'; // 'lobby' | 'mod' | 'group:<id>'
let lobbyMsgs = [];
const groupMsgs = {}; // id -> []
let myThread = []; // my private chat with the moderator
let modThreads = {}; // moderator only: key -> []
let selectedThread = null; // moderator only: key of member being viewed
const unreadThreads = new Set();
let modUnread = 0;
let lobbyUnread = 0;
let currentPhase = 'day';
let trialPopupShownFor = null;
let lastRendered = null; // { from, ts } of the last message drawn, for grouping

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
function avatar(name, extra = '') {
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
  if (channel.startsWith('group:') && !s.groups.some((g) => 'group:' + g.id === channel)) channel = 'lobby';
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

socket.on('group:history', ({ id, messages }) => {
  groupMsgs[id] = messages;
  if (channel === 'group:' + id) renderMessages();
});
socket.on('group:message', ({ id, message }) => {
  (groupMsgs[id] ||= []).push(message);
  if (channel === 'group:' + id) appendMessage(message);
});
socket.on('group:opened', (id) => switchChannel('group:' + id));

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
  if (channel !== 'mod' && message.from !== me) modUnread++;
  renderNav();
  if (channel === 'mod' && amMod()) renderThreadTabs();
});

socket.on('phase:changed', ({ phase, silent }) => setPhase(phase, !silent));

socket.on('role:assigned', ({ role }) => {
  openModal((card) => {
    const art = el('div', 'art role');
    art.innerHTML = ART[role];
    card.append(art);
    card.append(el('h2', '', role === 'werewolf' ? 'You are a Werewolf' : 'You are a Civilian'));
    card.append(
      el(
        'p',
        '',
        role === 'werewolf'
          ? 'Hunt at night. Blend in during the day. Only you and the moderator can see this.'
          : 'Find the werewolves before it is too late. Only you and the moderator can see this.'
      )
    );
    const actions = el('div', 'actions');
    actions.append(btn('btn-primary', 'Got it', closeModal));
    card.append(actions);
  });
});
socket.on('roles:cleared', () => {
  modThreads = {};
  unreadThreads.clear();
  if (channel === 'mod') renderAll();
});

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
      card.append(el('p', '', `${r.accused} is muted and can only talk to the moderator until the main chat is wiped.`));
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
  // Pop in at the center.
  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('show')));
  // After a few seconds, fly into the corner of the chat.
  setPhase._t1 = setTimeout(() => {
    flash.classList.remove('on');
    ov.classList.add('fly');
    const r = corner.getBoundingClientRect();
    Object.assign(ov.style, {
      left: r.left + r.width / 2 + 'px',
      top: r.top + r.height / 2 + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
    });
    setPhase._t2 = setTimeout(() => {
      corner.innerHTML = ART[phase];
      corner.style.visibility = '';
      corner.classList.remove('land');
      void corner.offsetWidth;
      corner.classList.add('land');
      ov.className = 'phase-overlay hidden';
    }, 900);
  }, 2600);
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

// ---------- Roles ----------
document.querySelectorAll('#roleBar button').forEach((b) => {
  b.onclick = () => selectedThread && socket.emit('mod:role', { to: displayName(selectedThread), role: b.dataset.role });
});

// ---------- Channels ----------
function switchChannel(c) {
  channel = c;
  if (c === 'mod') modUnread = 0;
  if (c === 'lobby') lobbyUnread = 0;
  closeDrawers();
  renderAll();
  if (!$('msgInput').disabled) $('msgInput').focus();
}
document.querySelectorAll('.nav-item[data-channel]').forEach((b) => (b.onclick = () => switchChannel(b.dataset.channel)));

$('newGroupBtn').onclick = () => {
  openModal((card) => {
    const art = el('div', 'art');
    art.innerHTML = '<div style="font-size:4rem;line-height:140px">👥</div>';
    card.append(art);
    card.append(el('h2', '', 'Create a group'));
    card.append(el('p', '', 'A side chat. Only people who join can read it.'));
    const input = el('input', 'text-input');
    input.maxLength = 30;
    input.placeholder = 'Group name, e.g. "Wolf den"';
    card.append(input);
    const create = () => {
      if (!input.value.trim()) return input.focus();
      socket.emit('group:create', input.value);
      closeModal();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && create());
    const actions = el('div', 'actions');
    actions.append(btn('btn-ghost', 'Cancel', closeModal), btn('btn-primary', 'Create group', create));
    card.append(actions);
    setTimeout(() => input.focus(), 60);
  });
};

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
  } else socket.emit('group:send', { id: channel.slice(6), text });
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
  if (redrawMessages || !renderAll._ch || renderAll._ch !== channelKey()) renderMessages();
  renderAll._ch = channelKey();
}
const channelKey = () => channel + '|' + (channel === 'mod' ? (amMod() ? 'm:' + selectedThread : 'p') : '') + '|' + inCurrentGroup();

function renderNav() {
  if (!state) return;
  const mc = $('meCard');
  mc.innerHTML = '';
  const a = avatar(me);
  a.append(el('span', 'dot'));
  const who = el('div', 'who');
  who.append(el('div', 'name', me));
  who.append(el('div', 'status', amMod() ? '🛡️ Moderator' : amMuted() ? '🔇 Muted' : 'Player'));
  mc.append(a, who);

  document.querySelectorAll('.nav-item[data-channel]').forEach((b) => b.classList.toggle('selected', b.dataset.channel === channel));
  $('modChannelLabel').textContent = amMod() ? 'Moderator inbox' : 'Talk to moderator';
  const setPill = (id, n) => {
    $(id).textContent = n > 9 ? '9+' : n;
    $(id).classList.toggle('hidden', n === 0);
  };
  setPill('modUnread', modUnread);
  setPill('lobbyUnread', lobbyUnread);

  const gl = $('groupList');
  gl.innerHTML = '';
  if (state.groups.length === 0) gl.append(el('div', 'empty-nav', 'No groups yet. Press ＋ to make one.'));
  for (const g of state.groups) {
    const b = el('button', 'nav-item' + (channel === 'group:' + g.id ? ' selected' : ''));
    b.append(el('span', 'nav-icon', '👥'), el('span', 'nav-label', g.name), el('span', 'nav-meta', String(g.members.length)));
    b.onclick = () => switchChannel('group:' + g.id);
    gl.append(b);
  }
}

function currentGroup() {
  return channel.startsWith('group:') && state ? state.groups.find((g) => 'group:' + g.id === channel) : null;
}
function inCurrentGroup() {
  const g = currentGroup();
  return !!g && g.members.some((n) => key(n) === key(me));
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
  } else {
    const g = currentGroup();
    title.textContent = '👥 ' + (g ? g.name : '');
    sub.textContent = g ? `${g.members.length} member${g.members.length === 1 ? '' : 's'}: ${g.members.join(', ')}` : '';
    if (g) {
      const inG = inCurrentGroup();
      actions.append(btn(inG ? 'btn-ghost' : 'btn-primary', inG ? 'Leave' : 'Join group', () => socket.emit(inG ? 'group:leave' : 'group:join', g.id)));
    }
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
  $('roleTarget').textContent = selectedThread ? displayName(selectedThread) : '';
}

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
  } else if (!inCurrentGroup()) {
    disabled = true;
    ph = 'Join the group to chat here.';
  } else if (amMuted()) {
    disabled = true;
    ph = '🔇 You are muted. You can only talk to the moderator.';
  } else ph = 'Message the group…';
  input.disabled = disabled;
  send.disabled = disabled;
  input.placeholder = ph;
  $('composer').classList.toggle('locked', disabled);
}

function renderPanel() {
  renderPhaseDisplay();

  // Moderator tools
  $('modTools').classList.toggle('hidden', !amMod());
  const open = !!state.trial?.open;
  $('dayBtn').classList.toggle('on', state.phase === 'day');
  $('nightBtn').classList.toggle('on', state.phase === 'night');
  $('trialBtn').disabled = open;

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
      const others = state.users.filter((u) => !u.moderator);
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

  // Players
  $('playerCount').textContent = state.users.length;
  const pl = $('playerList');
  pl.innerHTML = '';
  const sorted = [...state.users].sort((a, b) => b.moderator - a.moderator);
  for (const u of sorted) {
    const isMe = key(u.name) === key(me);
    const li = el('li', isMe ? 'me' : '');
    const a = avatar(u.name, 'sm');
    a.append(el('span', 'dot'));
    li.append(a, el('span', 'pname', u.name));
    if (isMe) li.append(el('span', 'tag you', 'you'));
    if (u.moderator) li.append(el('span', 'tag mod', 'mod'));
    if (u.muted) li.append(el('span', 'tag muted', 'muted'));
    pl.append(li);
  }

  // Wipe votes
  const wb = $('wipeBox');
  wb.innerHTML = '';
  const item = (kind, label) => {
    const voted = kind === 'main' ? state.me.wipedMain : state.me.wipedMod;
    const n = kind === 'main' ? state.wipe.main : state.wipe.mod;
    const need = state.wipe.needed;
    const w = el('div', 'wipe-item');
    const lab = el('div', 'progress-label');
    lab.append(el('span', '', label), el('b', '', `${n} / ${need}`));
    const bar = el('div', 'progress');
    const fill = el('i');
    fill.style.width = (100 * n) / Math.max(need, 1) + '%';
    bar.append(fill);
    const b = btn('btn-block ' + (voted ? 'on' : ''), voted ? '✓ You voted (undo)' : '🧹 Vote to wipe', () => socket.emit('wipe:vote', kind));
    w.append(lab, bar, b);
    wb.append(w);
  };
  item('main', 'Main chat (new game)');
  item('mod', 'Moderator chat');
}

// ---------- Messages ----------
function currentMessages() {
  if (channel === 'lobby') return lobbyMsgs;
  if (channel === 'mod') return amMod() ? modThreads[selectedThread] || [] : myThread;
  const g = currentGroup();
  if (!g) return [];
  return inCurrentGroup() ? groupMsgs[g.id] || [] : null;
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
  if (list === null) {
    box.append(emptyState('🔒', 'This group is private', 'Join the group to read and send messages.'));
    return;
  }
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
    else box.append(emptyState('👥', 'No messages yet', 'Start the conversation.'));
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
      r.append(art, el('div', '', `Secret role: ${m.role === 'werewolf' ? '🐺 Werewolf' : '🧑‍🌾 Civilian'}`));
      bubble.append(r);
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
